import type { DateRange } from "../helpers/date-range.js";
import { getStatsFromGitHub } from "./get-stats-from-github.js";
import { getProfileStatsFromCache, insertProfileStats } from "./store.js";

export const getStatsFromGitHubOrCache = async ({
  username,
  token,
  refreshCache,
  range,
}: {
  username: string;
  token: string;
  refreshCache: boolean;
  range: DateRange;
}) => {
  const fromCache = getProfileStatsFromCache(username, range);
  if (fromCache !== null && !refreshCache) {
    return fromCache;
  }

  const stats = await getStatsFromGitHub({
    loggedInWithGitHub: false,
    token,
    username,
    range,
  });

  if (stats) {
    await insertProfileStats(
      {
        type: "found",
        profile: stats,
        lowercasedUsername: stats.username.toLowerCase(),
      },
      range,
    );
  } else {
    await insertProfileStats(
      {
        lowercasedUsername: username.toLowerCase(),
        type: "not-found",
      },
      range,
    );
    return "not-found";
  }

  return stats;
};
