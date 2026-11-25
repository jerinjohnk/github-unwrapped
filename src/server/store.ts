// Local, file-based replacement for the MongoDB cache used in production.
// Everything lives in `.local-data/` at the repo root (gitignored), one folder
// per user, one file per date range (<range> = <from>_<to>):
//   stats/<username>/<range>.json            cached GitHub stats
//   renders/<username>/<theme>_<range>.mp4   rendered videos
//   og/<username>/<range>.jpg                social preview images
//   ig/<username>/<range>.jpg                Instagram story images

import { createHash } from "node:crypto";
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
import type { Platform, ProfileStats } from "../config.js";
import type { DateRange } from "../helpers/date-range.js";
import { rangeKey } from "../helpers/date-range.js";

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

const userFile = (dir: string, username: string, fileName: string) => {
  const userDir = path.join(dir, safeName(username));
  mkdirSync(userDir, { recursive: true });
  return path.join(userDir, fileName);
};

const statsFile = (username: string, range: DateRange) =>
  userFile(statsDir, username, `${rangeKey(range)}.json`);

const renderFileName = (theme: string, range: DateRange) =>
  `${safeName(theme)}_${rangeKey(range)}.mp4`;

/** Path of the video relative to rendersDir, as served under /renders/. */
export const renderPath = (username: string, theme: string, range: DateRange) =>
  `${safeName(username)}/${renderFileName(theme, range)}`;

export const renderFile = (username: string, theme: string, range: DateRange) =>
  userFile(rendersDir, username, renderFileName(theme, range));

export const ogImageFile = (username: string, range: DateRange) =>
  userFile(ogDir, username, `${rangeKey(range)}.jpg`);

export const igStoryFile = (username: string, range: DateRange) =>
  userFile(igDir, username, `${rangeKey(range)}.jpg`);

export const insertProfileStats = async (
  stats: ProfileSchema,
  range: DateRange,
) => {
  await writeFile(
    statsFile(stats.lowercasedUsername, range),
    JSON.stringify(stats, null, 2),
  );
};

export const getProfileStatsFromCache = (
  username: string,
  range: DateRange,
): ProfileStats | "not-found" | null => {
  const file = statsFile(username, range);
  if (!existsSync(file)) {
    return null;
  }

  const value = JSON.parse(readFileSync(file, "utf-8")) as ProfileSchema;
  return value.type === "found" ? value.profile : "not-found";
};

const clearUserDir = (dir: string, username: string) => {
  rmSync(path.join(dir, safeName(username)), { recursive: true, force: true });
};

/** Removes every cached video of a user, for all ranges and themes. */
export const clearRendersForUsername = ({ username }: { username: string }) => {
  clearUserDir(rendersDir, username);
};

/** Removes every cached image of a user, for all ranges. */
export const clearImagesForUsername = ({ username }: { username: string }) => {
  clearUserDir(ogDir, username);
  clearUserDir(igDir, username);
};

export const getNumberOfRenders = () => {
  return readdirSync(rendersDir, { recursive: true }).filter((f) =>
    String(f).endsWith(".mp4"),
  ).length;
};

/**
 * Removes the videos (preset and custom rocket colours) and images of one user
 * and range; stats are overwritten on refetch.
 */
export const clearRange = (
  username: string,
  range: DateRange,
  themes: readonly string[],
) => {
  for (const theme of themes) {
    rmSync(renderFile(username, theme, range), { force: true });
  }

  const userRenders = path.join(rendersDir, safeName(username));
  if (existsSync(userRenders)) {
    for (const file of readdirSync(userRenders)) {
      if (
        file.startsWith("color-") &&
        file.endsWith(`_${rangeKey(range)}.mp4`)
      ) {
        rmSync(path.join(userRenders, file), { force: true });
      }
    }
  }

  rmSync(ogImageFile(username, range), { force: true });
  rmSync(igStoryFile(username, range), { force: true });
};

/**
 * The name a user's files are stored under. Bitbucket users get a prefix so they
 * can't collide with a GitHub user of the same name (GitHub names can't contain
 * "--"), and a `variant` when the stats are limited to chosen repositories.
 */
export const storeOwner = (
  platform: Platform,
  username: string,
  variant?: string,
) => {
  const base = platform === "bitbucket" ? `bitbucket--${username}` : username;
  return variant ? `${base}--${variant}` : base;
};

/** Short, stable id for a set of chosen repositories. */
export const repoSelectionVariant = (repos: string[] | undefined) =>
  repos
    ? createHash("sha1")
        .update([...repos].sort().join("\n"))
        .digest("hex")
        .slice(0, 8)
    : undefined;
