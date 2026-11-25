import type { Request, Response } from "express";
import { reviewYearRange } from "../helpers/date-range.js";
import { makeOrGetIgStory, makeOrGetOgImage } from "./make-og-image.js";
import { getProfileStatsFromCache } from "./store.js";

const getStats = async (username: string | string[] | undefined) => {
  if (typeof username !== "string" || !username) {
    throw new Error("No username provided");
  }

  // Social previews belong to the original app, which reviews YEAR_TO_REVIEW.
  const stats = getProfileStatsFromCache(username, reviewYearRange());
  if (stats === "not-found" || stats === null) {
    throw new Error("No image for this user " + username);
  }

  return stats;
};

export const socialMediaPreview = async (req: Request, res: Response) => {
  const stats = await getStats(req.params.username);
  const file = await makeOrGetOgImage(stats);

  res.set("Content-Type", "image/jpeg");
  res.sendFile(file, { dotfiles: "allow" });
};

export const igStoryImageEndpoint = async (req: Request, res: Response) => {
  const stats = await getStats(req.params.username);
  const file = await makeOrGetIgStory(stats);

  res.set(
    "Content-Disposition",
    `attachment; filename="${stats.username}.jpeg"`,
  );
  res.set("Content-Type", "image/jpeg");
  res.sendFile(file, { dotfiles: "allow" });
};
