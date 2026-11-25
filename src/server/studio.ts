// The /studio page: a Commitscape-style form to enter a GitHub key, a user and a
// date range, preview the filtered stats and render the video.
//
// The key is only kept in the page's memory and sent with each stats request; the
// server uses it for that request's GitHub calls and never stores or logs it.
// Every /api/studio call must carry the random per-process session token embedded
// in the page and a localhost Host header, so other websites open in the same
// browser can't drive these endpoints.

import type { NextFunction, Request, Response } from "express";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "path";
import { z } from "zod";
import { rocketSchema, rocketValues } from "../config.js";
import { dateRangeSchema, rangePresets, today } from "../helpers/date-range.js";
import { TIME_ZONE_IANA, TIME_ZONE_LABEL } from "../helpers/timezone.js";
import { getStatsFromGitHubOrCache } from "./get-stats-from-github-or-cache.js";
import { GitHubError } from "./github-errors.js";
import {
  getGithubToken,
  hasEnvGithubToken,
  verifyGithubToken,
} from "./github-token.js";
import { renderOrGetProgress } from "./render.js";
import { clearRange, rootDir } from "./store.js";

const PAGE = path.join(rootDir, "studio", "index.html");
const SESSION_TOKEN = randomBytes(24).toString("hex");
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

const usernameSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9-]{1,39}$/, "Enter a valid GitHub username.");

const rangeFields = z
  .object({ from: z.string(), to: z.string() })
  .pipe(dateRangeSchema);

const StudioStatsRequest = z
  .object({
    key: z.string().optional(),
    username: usernameSchema,
    refresh: z.boolean().optional().default(false),
  })
  .and(rangeFields);

const StudioRenderRequest = z
  .object({ username: usernameSchema, theme: rocketSchema })
  .and(rangeFields);

class StudioError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

const parse = <T>(schema: z.ZodType<T>, body: unknown): T => {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new StudioError(
      [...new Set(result.error.issues.map((i) => i.message))].join(" "),
    );
  }

  return result.data;
};

const sameToken = (given: unknown) => {
  if (typeof given !== "string" || given.length !== SESSION_TOKEN.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(given), Buffer.from(SESSION_TOKEN));
};

const isLocalHost = (host: string | undefined) => {
  if (!host) {
    return false;
  }

  const hostname = host.startsWith("[")
    ? host.slice(0, host.indexOf("]") + 1)
    : host.split(":")[0];
  return LOCAL_HOSTS.has(hostname.toLowerCase());
};

/** Rejects /api/studio requests that don't come from the studio page on this machine. */
export const studioGuard = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (
    !isLocalHost(req.headers.host) ||
    !sameToken(req.headers["x-studio-token"])
  ) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  next();
};

export const studioPage = (_req: Request, res: Response) => {
  const todayDate = today();
  const config = {
    sessionToken: SESSION_TOKEN,
    today: todayDate,
    timeZone: { label: TIME_ZONE_LABEL, iana: TIME_ZONE_IANA },
    hasEnvKey: hasEnvGithubToken(),
    themes: rocketValues,
    ...rangePresets(todayDate),
  };
  // Escape "<" so the JSON can't close the surrounding <script> tag.
  const json = JSON.stringify(config).replace(/</g, "\\u003c");
  const html = readFileSync(PAGE, "utf-8").replace("__STUDIO_CONFIG__", json);

  res.set("Cache-Control", "no-store");
  res.type("html").send(html);
};

const handle =
  (fn: (body: unknown) => Promise<unknown>) =>
  async (req: Request, res: Response) => {
    try {
      res.json(await fn(req.body));
    } catch (err) {
      const status =
        err instanceof StudioError || err instanceof GitHubError
          ? err.status
          : 500;
      // The message never contains the key; GitHub errors don't echo it.
      res.status(status).json({ error: (err as Error).message });
    }
  };

export const studioStats = handle(async (body) => {
  const { key, username, from, to, refresh } = parse(StudioStatsRequest, body);
  const range = { from, to };
  const token = key?.trim() || getGithubToken();
  if (key?.trim()) {
    // Check an entered key even when cached stats would make it unnecessary.
    await verifyGithubToken(token);
  }

  const stats = await getStatsFromGitHubOrCache({
    username,
    token,
    refreshCache: refresh,
    range,
  });

  if (stats === "not-found") {
    throw new StudioError(`No GitHub user named "${username}".`, 404);
  }

  if (refresh) {
    // New numbers: drop the video and images made from the old ones.
    clearRange(stats.username, range, rocketValues);
  }

  return {
    username: stats.username,
    range: stats.range,
    periodLabel: stats.periodLabel,
    fetchedAt: stats.fetchedAt,
    totalContributions: stats.totalContributions,
    longestStreak: stats.longestStreak,
    activeDays: stats.contributionData.filter((c) => c > 0).length,
    days: stats.contributionData.length,
    totalPullRequests: stats.totalPullRequests,
    openIssues: stats.openIssues,
    closedIssues: stats.closedIssues,
    totalStars: stats.totalStars,
    topLanguages: stats.topLanguages,
    topWeekday: stats.topWeekday,
    topHour: stats.topHour,
    contributionData: stats.contributionData,
  };
});

export const studioRender = handle(async (body) => {
  const { username, theme, from, to } = parse(StudioRenderRequest, body);
  return renderOrGetProgress({ username, theme, from, to });
});
