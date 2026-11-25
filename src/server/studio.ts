// The /studio page: a Commitscape-style form to pick GitHub or Bitbucket, enter a
// key (and a GitHub user), choose a date range, preview the filtered stats and
// render the video.
//
// Keys are only kept in the page's memory and sent with each stats request; the
// server uses them for that request's API calls and never stores or logs them.
// Every /api/studio call must carry the random per-process session token embedded
// in the page and a localhost Host header, so other websites open in the same
// browser can't drive these endpoints.

import type { NextFunction, Request, Response } from "express";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "path";
import { z } from "zod";
import type { ProfileStats } from "../config.js";
import { platformSchema, rocketSchema, rocketValues } from "../config.js";
import { dateRangeSchema, rangePresets, today } from "../helpers/date-range.js";
import { backendCredentials } from "../helpers/domain.js";
import { TIME_ZONE_IANA, TIME_ZONE_LABEL } from "../helpers/timezone.js";
import { UserFacingError } from "./api-errors.js";
import { getBitbucketStatsOrCache } from "./bitbucket/cache.js";
import type { BitbucketAuth } from "./bitbucket/client.js";
import { REQUIRED_SCOPES } from "./bitbucket/client.js";
import { getBitbucketRepoChoices } from "./bitbucket/repos.js";
import { getStatsFromGitHubOrCache } from "./get-stats-from-github-or-cache.js";
import {
  getGithubToken,
  hasEnvGithubToken,
  verifyGithubToken,
} from "./github-token.js";
import { renderOrGetProgress } from "./render.js";
import { clearRange, rootDir, storeOwner } from "./store.js";

const PAGE = path.join(rootDir, "studio", "index.html");
const SESSION_TOKEN = randomBytes(24).toString("hex");
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

const usernameSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9-]{1,39}$/, "Enter a valid GitHub username.");

// "workspace/repo-slug"
const repoNameSchema = z
  .string()
  .regex(
    /^(?=[^/]*[A-Za-z0-9])[\w.-]+\/(?=[^/]*[A-Za-z0-9])[\w.-]+$/,
    "Invalid repository name.",
  );

const rangeFields = z
  .object({ from: z.string(), to: z.string() })
  .pipe(dateRangeSchema);

const StudioStatsRequest = z
  .discriminatedUnion("platform", [
    z.object({
      platform: z.literal("github"),
      key: z.string().optional(),
      username: usernameSchema,
      refresh: z.boolean().optional().default(false),
    }),
    z.object({
      // Bitbucket: the year in review of the API token's owner.
      platform: z.literal("bitbucket"),
      email: z.string().optional(),
      key: z.string().optional(),
      refresh: z.boolean().optional().default(false),
      // Chosen repositories; all with the user's pull requests when omitted.
      repos: z.array(repoNameSchema).min(1).max(200).optional(),
    }),
  ])
  .and(rangeFields);

const StudioReposRequest = z
  .object({ email: z.string().optional(), key: z.string().optional() })
  .and(rangeFields);

const StudioRenderRequest = z
  .object({
    platform: platformSchema,
    // Bitbucket nicknames may contain characters GitHub logins can't.
    username: z.string().trim().min(1).max(100),
    theme: rocketSchema,
    rocketColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, "Choose a colour like #ff8800.")
      .optional(),
    variant: z
      .string()
      .regex(/^[a-f0-9]{8}$/)
      .optional(),
  })
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
    hasEnvBitbucket: Boolean(
      backendCredentials().BITBUCKET_EMAIL &&
      backendCredentials().BITBUCKET_API_TOKEN,
    ),
    bitbucketScopes: REQUIRED_SCOPES,
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
        err instanceof StudioError || err instanceof UserFacingError
          ? err.status
          : 500;
      // The message never contains a key; GitHub/Bitbucket errors don't echo it.
      res.status(status).json({ error: (err as Error).message });
    }
  };

const bitbucketAuth = (email?: string, key?: string): BitbucketAuth => {
  if (email?.trim() || key?.trim()) {
    if (!email?.trim() || !key?.trim()) {
      throw new StudioError(
        "Enter both your Atlassian account email and the API token.",
      );
    }

    return { email: email.trim(), token: key.trim() };
  }

  const { BITBUCKET_EMAIL, BITBUCKET_API_TOKEN } = backendCredentials();
  if (!BITBUCKET_EMAIL || !BITBUCKET_API_TOKEN) {
    throw new StudioError(
      "Enter your Atlassian account email and a Bitbucket API token, or set BITBUCKET_EMAIL and BITBUCKET_API_TOKEN in .env.",
    );
  }

  return { email: BITBUCKET_EMAIL, token: BITBUCKET_API_TOKEN };
};

const githubStats = async (
  key: string | undefined,
  username: string,
  range: { from: string; to: string },
  refresh: boolean,
) => {
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

  return stats;
};

export const studioStats = handle(async (body) => {
  const request = parse(StudioStatsRequest, body);
  const range = { from: request.from, to: request.to };

  let stats: ProfileStats;
  let variant: string | undefined;
  let cached = false;
  if (request.platform === "github") {
    stats = await githubStats(
      request.key,
      request.username,
      range,
      request.refresh,
    );
  } else {
    ({ stats, variant, cached } = await getBitbucketStatsOrCache({
      auth: bitbucketAuth(request.email, request.key),
      range,
      refresh: request.refresh,
      repos: request.repos,
    }));
  }

  const platform = stats.platform ?? "github";
  if (request.refresh) {
    // New numbers: drop the video and images made from the old ones.
    clearRange(
      storeOwner(platform, stats.username, variant),
      range,
      rocketValues,
    );
  }

  return {
    platform,
    variant: variant ?? null,
    cached,
    username: stats.username,
    avatarUrl: stats.avatarUrl ?? null,
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
    bitbucket: stats.bitbucket ?? null,
    restrictedContributions: stats.restrictedContributions ?? 0,
  };
});

/** Bitbucket repositories to choose from for the range. */
export const studioBitbucketRepos = handle(async (body) => {
  const { email, key, from, to } = parse(StudioReposRequest, body);
  return getBitbucketRepoChoices({
    auth: bitbucketAuth(email, key),
    range: { from, to },
  });
});

export const studioRender = handle(async (body) => {
  const { platform, username, theme, from, to, variant, rocketColor } = parse(
    StudioRenderRequest,
    body,
  );
  return renderOrGetProgress({
    platform,
    username,
    theme,
    from,
    to,
    variant,
    rocketColor,
  });
});
