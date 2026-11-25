// The repositories offered on the studio page for a Bitbucket year in review.

import type { DateRange } from "../../helpers/date-range.js";
import { istParts } from "../../helpers/timezone.js";
import type { BitbucketAuth } from "./client.js";
import {
  BitbucketNotAllowedError,
  RequestBudget,
  bitbucketPages,
} from "./client.js";
import { getBitbucketUser, listMyPullRequests } from "./stats.js";

export type RepoChoice = {
  fullName: string;
  // Pull requests the user opened in it within the range.
  pullRequests: number;
  updatedOn: string | null;
};

/**
 * Repositories with the user's pull requests in the range (most first), then
 * other repositories in their workspaces updated within the range, where only
 * pull requests they approved would count.
 */
export const getBitbucketRepoChoices = async ({
  auth,
  range,
}: {
  auth: BitbucketAuth;
  range: DateRange;
}): Promise<{ username: string; repos: RepoChoice[] }> => {
  const budget = new RequestBudget(60);
  const me = await getBitbucketUser(auth, budget);
  const { workspaces, pullRequests } = await listMyPullRequests({
    auth,
    me,
    range,
    budget,
    gaps: [],
  });

  const counts = new Map<string, number>();
  for (const pr of pullRequests) {
    const name = pr.destination.repository.full_name;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  const updated = new Map<string, string>();
  for (const ws of workspaces) {
    try {
      const { values } = await bitbucketPages<{
        full_name: string;
        updated_on: string;
      }>({
        auth,
        path: `/repositories/${encodeURIComponent(ws)}`,
        params: {
          sort: "-updated_on",
          pagelen: "100",
          fields: "next,values.full_name,values.updated_on",
        },
        budget,
        maxPages: 5,
        shouldStop: (page) =>
          page.some((r) => istParts(r.updated_on).date < range.from),
      });
      for (const repo of values) {
        if (istParts(repo.updated_on).date >= range.from) {
          updated.set(repo.full_name, repo.updated_on);
        }
      }
    } catch (err) {
      if (!(err instanceof BitbucketNotAllowedError)) {
        throw err;
      }
    }
  }

  const names = new Set([...counts.keys(), ...updated.keys()]);
  const repos = [...names]
    .map((fullName) => ({
      fullName,
      pullRequests: counts.get(fullName) ?? 0,
      updatedOn: updated.get(fullName) ?? null,
    }))
    .sort(
      (a, b) =>
        b.pullRequests - a.pullRequests ||
        (b.updatedOn ?? "").localeCompare(a.updatedOn ?? ""),
    );

  return { username: me.nickname || me.display_name, repos };
};
