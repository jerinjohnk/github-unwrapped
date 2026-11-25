import { interpolate } from "remotion";
import type { Hour, ProfileStats } from "../config.js";
import type { DateRange } from "../helpers/date-range.js";
import { isInRange, periodLabel } from "../helpers/date-range.js";
import { getMostProductive } from "./commits/commits.js";
import { getTimesOfDay } from "./commits/get-times-of-day.js";
import { getALotOfGithubCommits } from "./commits/github-commits.js";
import { executeGitHubGraphQlQuery } from "./fetch-stats.js";
import { getMoreStars } from "./get-more-stars.js";
import type { BaseQueryResponse } from "./queries/base.query.js";
import { baseQuery } from "./queries/base.query.js";
import { getQuery } from "./queries/query.js";
import { getSearchCounts } from "./queries/search-counts.query.js";

const NOT_LANGUAGES = [
  "html",
  "markdown",
  "dockerfile",
  "roff",
  "rich text format",
];

const NOT_LANGUAGES_OBJ = Object.fromEntries(
  NOT_LANGUAGES.map((l) => [l, true]),
);

export const getStatsFromGitHub = async ({
  username,
  token,
  loggedInWithGitHub,
  range,
}: {
  username: string | null;
  token: string;
  loggedInWithGitHub: boolean;
  // Every number in the result is filtered to this inclusive date range.
  range: DateRange;
}): Promise<ProfileStats | null> => {
  const fetchedAt = Date.now();

  const baseData = (await executeGitHubGraphQlQuery({
    username,
    token,
    query: getQuery(username, baseQuery(range)),
  })) as BaseQueryResponse | null;
  if (baseData === null) {
    return baseData;
  }

  const [commits, stars, counts] = await Promise.all([
    getALotOfGithubCommits(username ?? baseData.login, token, range),
    getMoreStars({ token, username, range }),
    getSearchCounts({ login: baseData.login, token, range }),
  ]);

  const acc: Record<string, { color: string | null; value: number }> = {};

  baseData.contributionsCollection.commitContributionsByRepository.forEach(
    (i) => {
      i.repository.languages.edges
        .filter((e) => !NOT_LANGUAGES_OBJ[e.node.name.toLocaleLowerCase()])
        .forEach((l, index) => {
          const score = Math.max(0, 3 - index);

          const multiplier =
            i.contributions.totalCount *
            interpolate(l.size, [0, 3000000], [1, 10], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });

          acc[l.node.name] = {
            color: l.node.color,
            value: score * multiplier + (acc[l.node.name]?.value || 0),
          };
        });
    },
  );

  const valuesAddedTogether = Object.values(acc).reduce(
    (a, i) => a + i.value,
    0,
  );

  const topLanguages = Object.entries(acc)
    .sort((a, b) => b[1].value - a[1].value)
    .map((i) => {
      return {
        languageName: i[0],
        color: i[1].color,
        percent: i[1].value / valuesAddedTogether,
      };
    })
    .slice(0, 3);

  const productivity = getMostProductive(commits);

  const bestHours = getTimesOfDay(commits);
  const values = Object.entries(bestHours);
  const most = Math.max(...values.map((v) => v[1]));

  const mostHour = values.find(([, b]) => b === most);

  if (!mostHour) {
    throw new Error("No most hour");
  }

  const graphData = Object.entries(getTimesOfDay(commits)).map(
    ([key, entry]) => {
      return {
        productivity: entry,
        time: Number(key),
      };
    },
  );

  const allDays = baseData.contributionsCollection.contributionCalendar.weeks
    .map((w) => w.contributionDays)
    .flat(1)
    .filter((d) => isInRange(d.date, range));

  let longestStreak = 0;
  let currentStreak = 0;
  for (const day of allDays) {
    if (day.contributionCount > 0) {
      currentStreak++;
      // Also counts a streak that is still running at the end of the range.
      longestStreak = Math.max(longestStreak, currentStreak);
    } else {
      currentStreak = 0;
    }
  }

  return {
    range,
    periodLabel: periodLabel(range),
    longestStreak,
    totalPullRequests: counts.pullRequests,
    topLanguages,
    totalStars: stars.length,
    // Sum of the in-range days (what the grid shows), so totals of adjacent
    // ranges add up. GitHub's calendar total can include activity from days
    // just outside the range, as its day boundaries are not IST midnights.
    restrictedContributions:
      baseData.contributionsCollection.restrictedContributionsCount,
    totalContributions: allDays.reduce(
      (sum, d) => sum + d.contributionCount,
      0,
    ),
    closedIssues: counts.closedIssues,
    openIssues: counts.openIssues,
    fetchedAt,
    loggedInWithGitHub,
    username: baseData.login,
    lowercasedUsername: baseData.login.toLowerCase(),
    bestHours: getTimesOfDay(commits),
    topWeekday: productivity.most,
    topHour: String(mostHour[0]) as Hour,
    graphData,
    contributionData: allDays.map((d) => d.contributionCount),
    sampleStarredRepos: stars.map((s) => ({ name: s.name, author: s.owner })),
    allWeekdays: productivity.days,
  };
};
