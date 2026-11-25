import type { Request, Response } from "express";
import { makeOrGetIgStory, makeOrGetOgImage } from "./make-og-image.js";
import { getProfileStatsFromCache } from "./store.js";

const getStats = async (username: string | undefined) => {
  if (!username) {
    throw new Error("No username provided");
  }

  const stats = await getProfileStatsFromCache(username);
  if (stats === "not-found" || stats === null) {
    throw new Error("No image for this user " + username);
  }

  return stats;
};

export const socialMediaPreview = async (req: Request, res: Response) => {
  const stats = await getStats(req.params.username);
  const file = await makeOrGetOgImage(stats);

  res.set("Content-Type", "image/jpeg");
  res.sendFile(file);
};

export const igStoryImageEndpoint = async (req: Request, res: Response) => {
  const stats = await getStats(req.params.username);
  const file = await makeOrGetIgStory(stats);

  res.set(
    "Content-Disposition",
    `attachment; filename="${stats.username}.jpeg"`,
  );
  res.set("Content-Type", "image/jpeg");
  res.sendFile(file);
};
