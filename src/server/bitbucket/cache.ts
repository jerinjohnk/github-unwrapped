import type { ProfileStats } from "../../config.js";
import { BITBUCKET_STATS_VERSION, rocketValues } from "../../config.js";
import type { DateRange } from "../../helpers/date-range.js";
import {
  clearRange,
  getProfileStatsFromCache,
  insertProfileStats,
  repoSelectionVariant,
  storeOwner,
} from "../store.js";
import type { BitbucketAuth } from "./client.js";
import { RequestBudget, bitbucketGet } from "./client.js";
import { getBitbucketStats } from "./stats.js";

/**
 * Stats for the token owner, from the local cache unless `refresh` is set.
 * One /user call identifies the owner (and checks the key) before the cache lookup.
 */
export const getBitbucketStatsOrCache = async ({
  auth,
  range,
  refresh,
  repos,
}: {
  auth: BitbucketAuth;
  range: DateRange;
  refresh: boolean;
  // Limit to these repositories ("workspace/slug"); all when omitted.
  repos?: string[];
}): Promise<{
  stats: ProfileStats;
  variant: string | undefined;
  cached: boolean;
}> => {
  const me = await bitbucketGet<{ nickname?: string; display_name: string }>(
    auth,
    "/user",
    new RequestBudget(1),
  );
  const variant = repoSelectionVariant(repos);
  const owner = storeOwner(
    "bitbucket",
    me.nickname || me.display_name,
    variant,
  );

  const cached = getProfileStatsFromCache(owner, range);
  const current =
    cached &&
    cached !== "not-found" &&
    cached.bitbucket?.version === BITBUCKET_STATS_VERSION;
  if (current && !refresh) {
    return { stats: cached, variant, cached: true };
  }

  if (cached && !current) {
    // Computed by an older version: drop videos and images made from it.
    clearRange(owner, range, rocketValues);
  }

  const stats = await getBitbucketStats({ auth, range, repos });
  await insertProfileStats(
    { type: "found", profile: stats, lowercasedUsername: owner.toLowerCase() },
    range,
  );
  return { stats, variant, cached: false };
};
