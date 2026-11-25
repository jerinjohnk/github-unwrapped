import type { Request, Response } from "express";
import { StatsRequest } from "../config.js";
import { resolveRange } from "../helpers/date-range.js";
import { getStatsFromGitHubOrCache } from "./get-stats-from-github-or-cache.js";
import { badKeyError, rateLimitError } from "./github-errors.js";
import { getGithubToken } from "./github-token.js";
import { clearImagesForUsername, clearRendersForUsername } from "./store.js";

/** Runs a GraphQL query against GitHub and returns its `data`. */
export const executeRawGitHubGraphQlQuery = async ({
  token,
  query,
}: {
  token: string;
  query: string;
}) => {
  const res = await fetch(`https://api.github.com/graphql`, {
    method: "post",
    body: JSON.stringify({ query }),
    headers: {
      Authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
  });

  if (res.status === 401) {
    throw badKeyError();
  }

  const rateLimit = res.headers.get("x-ratelimit-remaining");
  if (res.status === 403 || res.status === 429) {
    throw rateLimitError("API");
  }

  if (Number(rateLimit) < 1000) {
    console.warn(`GitHub GraphQL rate limit remaining: ${rateLimit}`);
  }

  const response = await res.json();
  if (response.errors?.[0]?.type === "RATE_LIMITED") {
    throw rateLimitError("API");
  }

  if (response.errors) {
    if (
      response.errors?.[0].message?.includes(
        "Could not resolve to a User with the login",
      )
    ) {
      return null;
    }

    throw new Error(JSON.stringify(response.errors[0].message));
  }

  if (!response.data) {
    throw new Error(
      `Unexpected response from GitHub (${res.status}): ${
        response.message ?? "no data"
      }`,
    );
  }

  return response.data;
};

/** Runs a query nested in `user(login: …)` or `viewer`, returning that object. */
export const executeGitHubGraphQlQuery = async ({
  username,
  token,
  query,
}: {
  username: string | null;
  token: string;
  query: string;
}) => {
  const data = await executeRawGitHubGraphQlQuery({ token, query });
  if (data === null) {
    return null;
  }

  return username === null ? data.viewer : data.user;
};

export const statsEndPoint = async (request: Request, response: Response) => {
  if (request.method === "OPTIONS") {
    return response.end();
  }

  try {
    const { username, refreshCache, from, to } = StatsRequest.parse(
      request.body,
    );

    await getStatsFromGitHubOrCache({
      username,
      token: getGithubToken(),
      refreshCache,
      range: resolveRange({ from, to }),
    });

    if (refreshCache) {
      clearRendersForUsername({ username });
      clearImagesForUsername({ username });
    }

    return response.json({});
  } catch (err) {
    response.json({ error: (err as Error).message });
  }
};
