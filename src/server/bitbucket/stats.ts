// Builds a year in review for the owner of a Bitbucket API token.
//
// Bitbucket has no contribution calendar and no "commits by user" search, and
// busy shared repositories get thousands of commits a year from the whole team,
// so reading every repository's history is not feasible. Instead everything is
// derived from pull requests:
// - pull requests the user opened in the range (/workspaces/{ws}/pullrequests/{user});
// - the user's own commits in those pull requests (merge commits left out);
// - languages from the files those pull requests changed, by extension;
// - pull requests by others that the user approved (the video's "stars").
// A day's contributions = own commits + pull requests opened + approvals given.
// All dates are converted to IST.

import { createHash } from "node:crypto";
import type { BitbucketSummary, Hour, ProfileStats } from "../../config.js";
import { BITBUCKET_STATS_VERSION } from "../../config.js";
import type { DateRange } from "../../helpers/date-range.js";
import {
  isInRange,
  periodLabel,
  rangeEndDateTime,
  rangeStartDateTime,
  today,
} from "../../helpers/date-range.js";
import { istParts } from "../../helpers/timezone.js";
import type { Commit } from "../commits/commits.js";
import { getMostProductive } from "../commits/commits.js";
import { getTimesOfDay } from "../commits/get-times-of-day.js";
import type { BitbucketAuth } from "./client.js";
import {
  BitbucketNotAllowedError,
  RequestBudget,
  bitbucketGet,
  bitbucketGetText,
  bitbucketPages,
} from "./client.js";
import {
  languageColor,
  languageOfPath,
  normalizeLanguage,
} from "./languages.js";

// Bitbucket allows 1,000+ repository requests an hour per user; leave headroom.
const REQUEST_BUDGET = 800;
// Pull requests whose changed files are read, for languages and PR sizes
// (spread over the range if there are more).
const MAX_DIFFSTAT_PRS = 150;
// The video's cockpit shows this many of the biggest pull requests.
const BIGGEST_SHOWN = 8;
// Lines counted per changed file, so one huge generated file can't dominate.
const MAX_LINES_PER_FILE = 2000;
const CONCURRENCY = 6;

// Merges of shared branches carry everyone's work, not the author's.
const INTEGRATION_BRANCH =
  /^(develop|development|dev|main|master|release|staging|stage|uat|qa|production|prod)$/i;
// Pull requests into these are usually releases with the whole team's changes.
const RELEASE_TARGET = /^(main|master|production|prod)$/i;
// Release or cherry-pick branches as the source (e.g. "cp_and_5.5.3_sanity").
const RELEASE_SOURCE = /^(cp|release|rc)([-_./]|$)/i;
// Environment branches as the target: a feature promoted again to QA etc.
// (e.g. "CommonQA") is the same work as its first pull request.
const ENVIRONMENT_TARGET = /qa|uat|staging|preprod|sanity/i;

type BitbucketUser = {
  uuid: string;
  account_id?: string;
  username?: string;
  nickname?: string;
  display_name: string;
  links?: { avatar?: { href?: string } };
};

type WorkspaceAccess = { workspace: { slug: string } };
type Repo = { full_name: string; language?: string; updated_on: string };

type PullRequest = {
  id: number;
  title: string;
  created_on: string;
  state: "OPEN" | "MERGED" | "DECLINED" | "SUPERSEDED";
  source?: { branch?: { name?: string } };
  destination: {
    repository: { full_name: string };
    branch?: { name?: string };
  };
};

type ReviewedPullRequest = {
  id: number;
  title: string;
  author?: { uuid?: string; display_name?: string };
  participants?: {
    user?: { uuid?: string };
    approved?: boolean;
    participated_on?: string;
  }[];
};

type BitbucketCommit = {
  hash: string;
  date: string;
  message?: string;
  parents?: { hash: string }[];
  author?: { raw?: string; user?: { uuid?: string; account_id?: string } };
};

type DiffStat = {
  lines_added?: number;
  lines_removed?: number;
  new?: { path?: string } | null;
  old?: { path?: string } | null;
};

const mapLimit = async <T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> => {
  const results: R[] = new Array(items.length);
  let index = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (index < items.length) {
        const i = index++;
        results[i] = await fn(items[i]);
      }
    },
  );
  await Promise.all(workers);
  return results;
};

/** Skips resources the key may not read (403/404) instead of failing the whole fetch. */
const ifAllowed = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof BitbucketNotAllowedError) {
      return fallback;
    }

    throw err;
  }
};

/**
 * Reorders items so that any prefix covers the whole list evenly
 * (0, n/2, n/4, 3n/4, …). If the request budget runs out part-way, the data
 * that is missing is spread over the range instead of all being the oldest.
 */
export const spreadOrder = <T>(items: T[]): T[] => {
  const order: T[] = [];
  const taken = new Set<number>();
  for (let step = items.length; step >= 1; step = Math.floor(step / 2)) {
    for (let i = 0; i < items.length; i += step) {
      if (!taken.has(i)) {
        taken.add(i);
        order.push(items[i]);
      }
    }

    if (step === 1) {
      break;
    }
  }

  return order;
};

const emailOf = (raw: string | undefined) =>
  raw
    ?.match(/<([^>]+)>/)?.[1]
    ?.trim()
    .toLowerCase() ?? null;

const enumerateDays = (from: string, to: string) => {
  const days: string[] = [];
  const date = new Date(`${from}T00:00:00Z`);
  for (;;) {
    const day = date.toISOString().slice(0, 10);
    if (day > to) {
      return days;
    }

    days.push(day);
    date.setUTCDate(date.getUTCDate() + 1);
  }
};

const shortTitle = (title: string) =>
  title.length > 40 ? `${title.slice(0, 39)}…` : title;

const fmtNumber = (n: number) => n.toLocaleString("en-US");

const repoPath = (fullName: string) =>
  fullName.split("/").map(encodeURIComponent).join("/");

type FoundCommit = {
  hash: string;
  repo: string;
  date: number;
  subject: string;
};

// Diffs fetched at most per fetch to detect rebased/cherry-picked copies.
const MAX_PATCH_CHECKS = 60;

/**
 * A stable id for a diff, like `git patch-id`: the changed lines and file
 * names, ignoring line numbers, hashes and whitespace at line ends.
 */
export const patchId = (diff: string) => {
  const kept = diff
    .split("\n")
    .filter(
      (line) =>
        line.startsWith("diff --git") ||
        ((line.startsWith("+") || line.startsWith("-")) &&
          !line.startsWith("+++") &&
          !line.startsWith("---")),
    )
    .map((line) => line.trimEnd());
  return createHash("sha1").update(kept.join("\n")).digest("hex");
};

/** Hashes of commits that are copies of an earlier commit with the same patch. */
const findCopies = async ({
  auth,
  budget,
  commits,
}: {
  auth: BitbucketAuth;
  budget: RequestBudget;
  commits: FoundCommit[];
}): Promise<Set<string>> => {
  const bySubject = new Map<string, FoundCommit[]>();
  for (const c of commits) {
    if (c.subject) {
      bySubject.set(c.subject, [...(bySubject.get(c.subject) ?? []), c]);
    }
  }

  const suspects = [...bySubject.values()]
    .filter((group) => group.length > 1)
    .flat()
    .slice(0, MAX_PATCH_CHECKS);
  const patches = new Map<string, string>();
  await mapLimit(suspects, CONCURRENCY, (c) =>
    ifAllowed(async () => {
      if (budget.exhausted) {
        return;
      }

      const diff = await bitbucketGetText(
        auth,
        `/repositories/${repoPath(c.repo)}/diff/${encodeURIComponent(c.hash)}`,
        budget,
      );
      patches.set(c.hash, patchId(diff));
    }, undefined),
  );

  // Of each set of copies, keep the earliest commit.
  const copies = new Set<string>();
  const firstByPatch = new Map<string, FoundCommit>();
  for (const c of [...suspects].sort((a, b) => a.date - b.date)) {
    const patch = patches.get(c.hash);
    if (!patch) {
      continue;
    }

    const key = `${c.subject}|${patch}`;
    if (firstByPatch.has(key)) {
      copies.add(c.hash);
    } else {
      firstByPatch.set(key, c);
    }
  }

  return copies;
};

export type BitbucketPullRequest = PullRequest;

export const getBitbucketUser = (auth: BitbucketAuth, budget: RequestBudget) =>
  bitbucketGet<BitbucketUser>(auth, "/user", budget);

/** The user's workspaces and the pull requests they opened within the range. */
export const listMyPullRequests = async ({
  auth,
  me,
  range,
  budget,
  gaps,
}: {
  auth: BitbucketAuth;
  me: { uuid: string };
  range: DateRange;
  budget: RequestBudget;
  gaps: string[];
}) => {
  const createdInRange = `created_on >= ${rangeStartDateTime(range)} AND created_on < ${rangeEndDateTime(range)}`;
  const { values: access } = await bitbucketPages<WorkspaceAccess>({
    auth,
    path: "/user/workspaces",
    params: { pagelen: "100" },
    budget,
    maxPages: 5,
  });
  const workspaces = access.map((a) => a.workspace.slug);

  const pullRequests = (
    await mapLimit(workspaces, CONCURRENCY, (ws) =>
      ifAllowed(async () => {
        const result = await bitbucketPages<PullRequest>({
          auth,
          path: `/workspaces/${encodeURIComponent(ws)}/pullrequests/${encodeURIComponent(me.uuid)}`,
          params: {
            state: ["OPEN", "MERGED", "DECLINED", "SUPERSEDED"],
            q: createdInRange,
            sort: "-created_on",
            pagelen: "50",
            fields:
              "next,values.id,values.title,values.created_on,values.state,values.source.branch.name,values.destination.branch.name,values.destination.repository.full_name",
          },
          budget,
          maxPages: 40,
        });
        if (!result.complete) {
          gaps.push(`pull requests in ${ws}: more than 2,000 in the range`);
        }
        return result.values.filter((pr) => isInRange(pr.created_on, range));
      }, [] as PullRequest[]),
    )
  ).flat();

  return { workspaces, pullRequests };
};

export const getBitbucketStats = async ({
  auth,
  range,
  repos,
}: {
  auth: BitbucketAuth;
  range: DateRange;
  // Full names ("workspace/slug") to limit the stats to; all when omitted.
  repos?: string[];
}): Promise<ProfileStats> => {
  const fetchedAt = Date.now();
  const budget = new RequestBudget(REQUEST_BUDGET);
  // Why some data may be missing (lists cut short by page limits or the budget).
  const gaps: string[] = [];

  const me = await getBitbucketUser(auth, budget);
  const username = me.nickname || me.display_name;
  const createdInRange = `created_on >= ${rangeStartDateTime(range)} AND created_on < ${rangeEndDateTime(range)}`;

  // Commits may be made with any of the account's verified emails.
  const myEmails = new Set<string>([auth.email.toLowerCase()]);
  await ifAllowed(async () => {
    const { values } = await bitbucketPages<{ email: string }>({
      auth,
      path: "/user/emails",
      params: { pagelen: "100" },
      budget,
      maxPages: 2,
    });
    values.forEach((e) => myEmails.add(e.email.toLowerCase()));
  }, undefined);

  const isMine = (commit: BitbucketCommit) => {
    const user = commit.author?.user;
    if (user?.uuid) {
      return user.uuid === me.uuid;
    }

    if (user?.account_id) {
      return user.account_id === me.account_id;
    }

    const email = emailOf(commit.author?.raw);
    return email !== null && myEmails.has(email);
  };

  const { workspaces, pullRequests: allPullRequests } =
    await listMyPullRequests({ auth, me, range, budget, gaps });

  // Only the chosen repositories, when the user picked some.
  const selected = repos ? new Set(repos) : null;
  const pullRequests = selected
    ? allPullRequests.filter((pr) =>
        selected.has(pr.destination.repository.full_name),
      )
    : allPullRequests;

  const myRepos = [
    ...new Set(pullRequests.map((pr) => pr.destination.repository.full_name)),
  ];
  // Approvals are looked for in every chosen repository, including ones
  // without pull requests by the user.
  const reviewRepos = repos ?? myRepos;

  // Stages 2–4 only depend on the pull request list, so they run at the
  // same time; the results are combined once all three are done.

  // 2. Pull requests by others that the user approved (counted as contributions).
  //    Found per repository the user works in, via the reviewers filter.
  const approvals: { date: string; title: string; author: string }[] = [];
  const approvalsStage = mapLimit(reviewRepos, CONCURRENCY, (repo) =>
    ifAllowed(async () => {
      const result = await bitbucketPages<ReviewedPullRequest>({
        auth,
        path: `/repositories/${repoPath(repo)}/pullrequests`,
        params: {
          q: `reviewers.uuid = "${me.uuid}" AND ${createdInRange}`,
          state: ["OPEN", "MERGED", "DECLINED", "SUPERSEDED"],
          pagelen: "50",
          fields:
            "next,values.id,values.title,values.author.uuid,values.author.display_name,values.participants.user.uuid,values.participants.approved,values.participants.participated_on",
        },
        budget,
        maxPages: 20,
      });
      if (!result.complete) {
        gaps.push(`reviews in ${repo}: more than 1,000 in the range`);
      }
      for (const pr of result.values) {
        const mine = pr.participants?.find((p) => p.user?.uuid === me.uuid);
        if (!mine?.approved || pr.author?.uuid === me.uuid) {
          continue;
        }

        // participated_on is when the user last acted on the pull request.
        const date = mine.participated_on;
        if (date && isInRange(date, range)) {
          approvals.push({
            date,
            title: pr.title,
            author: pr.author?.display_name ?? "",
          });
        }
      }
    }, undefined),
  );

  // 3. The user's own commits in their pull requests. Merge commits and other
  //    people's commits (e.g. from merging a shared branch in) are left out.
  const seen = new Set<string>();
  const found: FoundCommit[] = [];
  let prsSkipped = 0;

  const commitsStage = mapLimit(spreadOrder(pullRequests), CONCURRENCY, (pr) =>
    ifAllowed(async () => {
      if (budget.exhausted) {
        prsSkipped++;
        return;
      }

      const repo = pr.destination.repository.full_name;
      const result = await bitbucketPages<BitbucketCommit>({
        auth,
        path: `/repositories/${repoPath(repo)}/pullrequests/${pr.id}/commits`,
        params: {
          pagelen: "100",
          fields:
            "next,values.hash,values.date,values.message,values.parents.hash,values.author.raw,values.author.user.uuid,values.author.user.account_id",
        },
        budget,
        // Release pull requests can hold the whole team's commits for months.
        maxPages: 40,
        // Newest first: stop once a whole page is from before the range.
        shouldStop: (page) =>
          page.every((c) => istParts(c.date).date < range.from),
      });
      if (!result.complete) {
        gaps.push(
          `${repo} PR #${pr.id}: more than 4,000 commits, older ones not read`,
        );
      }

      for (const commit of result.values) {
        if (
          seen.has(commit.hash) ||
          (commit.parents?.length ?? 0) > 1 ||
          !isInRange(commit.date, range) ||
          !isMine(commit)
        ) {
          continue;
        }

        seen.add(commit.hash);
        found.push({
          hash: commit.hash,
          repo,
          date: new Date(commit.date).getTime(),
          subject: (commit.message ?? "").split("\n")[0].trim(),
        });
      }
    }, undefined),
  );
  // 4. Languages and pull request sizes from the files changed in the
  //    user's own pull requests (not merges of shared branches or releases),
  //    counting code files only, weighted by lines changed.
  const languageLines = new Map<string, number>();
  const prSizes: {
    pr: PullRequest;
    added: number;
    removed: number;
    // Ranking size, with each file capped so one huge file can't dominate.
    ranked: number;
  }[] = [];
  const accepted = pullRequests.filter(
    (pr) => pr.state !== "DECLINED" && pr.state !== "SUPERSEDED",
  );
  const featureWork = accepted.filter((pr) => {
    const source = pr.source?.branch?.name ?? "";
    const target = pr.destination.branch?.name ?? "";
    return (
      !INTEGRATION_BRANCH.test(source) &&
      !RELEASE_SOURCE.test(source) &&
      !RELEASE_TARGET.test(target) &&
      !ENVIRONMENT_TARGET.test(target)
    );
  });
  // Teams that merge features straight into main/master have no other PRs.
  const ownWork = featureWork.length > 0 ? featureWork : accepted;
  const diffStage = mapLimit(
    spreadOrder(ownWork).slice(0, MAX_DIFFSTAT_PRS),
    CONCURRENCY,
    (pr) =>
      ifAllowed(async () => {
        if (budget.exhausted) {
          return;
        }

        const { values } = await bitbucketPages<DiffStat>({
          auth,
          path: `/repositories/${repoPath(pr.destination.repository.full_name)}/pullrequests/${pr.id}/diffstat`,
          params: {
            pagelen: "500",
            fields:
              "next,values.lines_added,values.lines_removed,values.new.path,values.old.path",
          },
          budget,
          maxPages: 1,
        });
        let added = 0;
        let removed = 0;
        let ranked = 0;
        for (const file of values) {
          const language = languageOfPath(
            file.new?.path ?? file.old?.path ?? "",
          );
          if (!language) {
            continue;
          }

          const lines = Math.min(
            (file.lines_added ?? 0) + (file.lines_removed ?? 0),
            MAX_LINES_PER_FILE,
          );
          languageLines.set(
            language,
            (languageLines.get(language) ?? 0) + lines,
          );
          added += file.lines_added ?? 0;
          removed += file.lines_removed ?? 0;
          ranked += lines;
        }

        prSizes.push({ pr, added, removed, ranked });
      }, undefined),
  );

  await Promise.all([approvalsStage, commitsStage, diffStage]);

  if (prsSkipped > 0) {
    gaps.push(
      `${prsSkipped} pull requests' commits not read (request budget used up)`,
    );
  }

  // Rebased or cherry-picked copies (e.g. in "cp_and_…" release branches)
  // have new hashes. Like the Commitscape analyser, treat commits by the same
  // author with the same patch as one; only commits sharing a subject line
  // are compared, so this needs few requests.
  const copies = await findCopies({ auth, budget, commits: found });
  const commits: Commit[] = [];
  const commitsPerRepo = new Map<string, number>();
  for (const c of found) {
    if (copies.has(c.hash)) {
      continue;
    }

    commits.push({
      author: username,
      date: c.date,
      hour: istParts(c.date).hour,
      message: "",
      repo: c.repo,
      fork: false,
    });
    commitsPerRepo.set(c.repo, (commitsPerRepo.get(c.repo) ?? 0) + 1);
  }

  // Fallback when no changed code files were found: the repositories' manual
  // language settings, weighted by the user's commits.
  if (languageLines.size === 0 && myRepos.length > 0) {
    await ifAllowed(async () => {
      for (const ws of workspaces) {
        const { values } = await bitbucketPages<Repo>({
          auth,
          path: `/repositories/${encodeURIComponent(ws)}`,
          params: {
            q: myRepos.map((r) => `full_name = "${r}"`).join(" OR "),
            pagelen: "100",
            fields: "next,values.full_name,values.language",
          },
          budget,
          maxPages: 2,
        });
        for (const repo of values) {
          const language = normalizeLanguage(repo.language);
          const count = commitsPerRepo.get(repo.full_name) ?? 0;
          if (language && count > 0) {
            languageLines.set(
              language,
              (languageLines.get(language) ?? 0) + count,
            );
          }
        }
      }
    }, undefined);
  }

  const languageTotal = [...languageLines.values()].reduce((a, b) => a + b, 0);
  const topLanguages = [...languageLines.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([languageName, value]) => ({
      languageName,
      color: languageColor(languageName),
      percent: value / languageTotal,
    }));

  // Contributions per day (IST): own commits + pull requests opened + approvals.
  const lastDay = range.to < today() ? range.to : today();
  const days = enumerateDays(range.from, lastDay);
  const perDay = new Map<string, number>(days.map((d) => [d, 0]));
  const addDay = (instant: string | number) => {
    const day = istParts(instant).date;
    if (perDay.has(day)) {
      perDay.set(day, (perDay.get(day) ?? 0) + 1);
    }
  };

  commits.forEach((c) => addDay(c.date));
  pullRequests.forEach((pr) => addDay(pr.created_on));
  approvals.forEach((a) => addDay(a.date));
  const contributionData = days.map((d) => perDay.get(d) ?? 0);

  let longestStreak = 0;
  let currentStreak = 0;
  for (const count of contributionData) {
    currentStreak = count > 0 ? currentStreak + 1 : 0;
    longestStreak = Math.max(longestStreak, currentStreak);
  }

  // Most productive day and hour (IST), from the user's commits.
  const productivity = getMostProductive(commits);
  const bestHours = getTimesOfDay(commits);
  const most = Math.max(...Object.values(bestHours));
  const topHour = (Object.entries(bestHours).find(([, v]) => v === most)?.[0] ??
    "0") as Hour;

  const merged = pullRequests.filter((pr) => pr.state === "MERGED").length;
  const open = pullRequests.filter((pr) => pr.state === "OPEN").length;
  const declined = pullRequests.length - merged - open;

  // Identical line counts in one repository mean the same change raised
  // twice (e.g. to two branches): show it once.
  const sameChange = new Set<string>();
  const biggest = prSizes
    .filter((p) => p.ranked > 0)
    .sort((a, b) => b.ranked - a.ranked)
    .filter((p) => {
      const key = `${p.pr.destination.repository.full_name}|${p.added}|${p.removed}`;
      if (sameChange.has(key)) {
        return false;
      }

      sameChange.add(key);
      return true;
    })
    .slice(0, BIGGEST_SHOWN);

  const bitbucket: BitbucketSummary = {
    version: BITBUCKET_STATS_VERSION,
    workspaces: workspaces.length,
    repositories: reviewRepos.length,
    commits: commits.length,
    copiesSkipped: copies.size,
    biggestPullRequests: biggest.map(({ pr, added, removed }) => ({
      id: pr.id,
      repo: pr.destination.repository.full_name,
      title: pr.title,
      added,
      removed,
    })),
    approvals: approvals.length,
    pullRequests: { open, merged, declined },
    requests: budget.used,
    complete: gaps.length === 0,
    gaps: gaps.slice(0, 5),
  };

  return {
    platform: "bitbucket",
    avatarUrl: me.links?.avatar?.href,
    bitbucket,
    range,
    periodLabel: periodLabel(range),
    // The video's pull request scene says "pull requests merged".
    totalPullRequests: merged,
    username,
    lowercasedUsername: username.toLowerCase(),
    // The video's issues scene shows PR outcomes for Bitbucket:
    // all PRs opened, of which `closedIssues` were merged.
    openIssues: pullRequests.length - merged,
    closedIssues: merged,
    fetchedAt,
    loggedInWithGitHub: false,
    // The video's stars scene shows the pull requests raised for Bitbucket:
    // the count, and the biggest ones in the cockpit display (biggest first,
    // then the rest, as one entry is shown per star that hits).
    totalStars: pullRequests.length,
    sampleStarredRepos: [
      ...biggest.map(({ pr, added, removed }) => ({
        name: shortTitle(pr.title),
        author: `+${fmtNumber(added)} −${fmtNumber(removed)} lines`,
      })),
      ...pullRequests
        .filter((pr) => !biggest.some((b) => b.pr === pr))
        .map((pr) => ({ name: shortTitle(pr.title), author: "" })),
    ],
    longestStreak,
    totalContributions: contributionData.reduce((a, b) => a + b, 0),
    topLanguages,
    bestHours,
    topWeekday: productivity.most,
    topHour,
    graphData: Object.entries(bestHours).map(([time, value]) => ({
      time: Number(time),
      productivity: value,
    })),
    contributionData,
    allWeekdays: productivity.days,
  };
};
