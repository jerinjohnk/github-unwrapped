import type { Platform } from "../src/config";

/** The name shown in the video for each platform. */
export const brandName = (platform: Platform | undefined) =>
  platform === "bitbucket" ? "Bitbucket Unwrapped" : "GitHub Unwrapped";
