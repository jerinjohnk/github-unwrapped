// Local, file-based replacement for the MongoDB cache used in production.
// Everything lives in `.local-data/` at the repo root (gitignored):
//   stats/<username>.json          cached GitHub stats
//   renders/<username>-<theme>.mp4 rendered videos
//   og/<username>.jpg              social preview images
//   ig/<username>.jpg              Instagram story images

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "path";
import type { ProfileStats } from "../config.js";
import { rocketValues } from "../config.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
export const rootDir = path.join(__dirname, "..", "..");
export const dataDir = path.join(rootDir, ".local-data");

const statsDir = path.join(dataDir, "stats");
export const rendersDir = path.join(dataDir, "renders");
const ogDir = path.join(dataDir, "og");
const igDir = path.join(dataDir, "ig");

for (const dir of [statsDir, rendersDir, ogDir, igDir]) {
  mkdirSync(dir, { recursive: true });
}

type ProfileSchema =
  | {
      type: "found";
      lowercasedUsername: string;
      profile: ProfileStats;
    }
  | {
      lowercasedUsername: string;
      type: "not-found";
    };

// Usernames are validated by GitHub, but guard against path traversal anyway.
const safeName = (username: string) =>
  username.toLowerCase().replace(/[^a-z0-9-]/g, "");

const statsFile = (username: string) =>
  path.join(statsDir, `${safeName(username)}.json`);

export const renderFileName = (username: string, theme: string) =>
  `${safeName(username)}-${safeName(theme)}.mp4`;

export const renderFile = (username: string, theme: string) =>
  path.join(rendersDir, renderFileName(username, theme));

export const ogImageFile = (username: string) =>
  path.join(ogDir, `${safeName(username)}.jpg`);

export const igStoryFile = (username: string) =>
  path.join(igDir, `${safeName(username)}.jpg`);

export const insertProfileStats = async (stats: ProfileSchema) => {
  await writeFile(
    statsFile(stats.lowercasedUsername),
    JSON.stringify(stats, null, 2),
  );
};

export const getProfileStatsFromCache = (
  username: string,
): ProfileStats | "not-found" | null => {
  const file = statsFile(username);
  if (!existsSync(file)) {
    return null;
  }

  const value = JSON.parse(readFileSync(file, "utf-8")) as ProfileSchema;
  return value.type === "found" ? value.profile : "not-found";
};

export const clearRendersForUsername = ({ username }: { username: string }) => {
  for (const theme of rocketValues) {
    rmSync(renderFile(username, theme), { force: true });
  }
};

export const clearImagesForUsername = ({ username }: { username: string }) => {
  rmSync(ogImageFile(username), { force: true });
  rmSync(igStoryFile(username), { force: true });
};

export const getNumberOfRenders = () => {
  return readdirSync(rendersDir).filter((f) => f.endsWith(".mp4")).length;
};
