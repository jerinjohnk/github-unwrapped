import { existsSync } from "node:fs";
import type { z } from "zod";
import type { ProfileStats, ogImageSchema } from "../config.js";
import { parseTopLanguage } from "../config.js";
import { renderStillLocally } from "./local-renderer.js";
import { igStoryFile, ogImageFile } from "./store.js";

const makeImageProps = (
  profileStats: ProfileStats,
): z.infer<typeof ogImageSchema> => ({
  pullRequests: profileStats.totalPullRequests,
  contributionData: profileStats.contributionData,
  issues: profileStats.closedIssues,
  login: profileStats.username,
  stars: profileStats.totalStars,
  topLanguage: profileStats.topLanguages[0]
    ? parseTopLanguage(profileStats.topLanguages[0])
    : null,
  weekdays: profileStats.allWeekdays,
  longestStreak: profileStats.longestStreak,
  totalContributions: profileStats.totalContributions,
});

const makeOrGetImage = async (
  profileStats: ProfileStats,
  compositionId: "og-image" | "ig-story",
  outputFile: string,
) => {
  if (!existsSync(outputFile)) {
    await renderStillLocally({
      compositionId,
      inputProps: makeImageProps(profileStats),
      outputFile,
    });
  }

  return outputFile;
};

export const makeOrGetOgImage = (profileStats: ProfileStats) =>
  makeOrGetImage(profileStats, "og-image", ogImageFile(profileStats.username));

export const makeOrGetIgStory = (profileStats: ProfileStats) =>
  makeOrGetImage(profileStats, "ig-story", igStoryFile(profileStats.username));
