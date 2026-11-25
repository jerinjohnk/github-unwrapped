import type { Request, Response } from "express";
import { StatsRequest } from "../config.js";
import { getStatsFromGitHubOrCache } from "./get-stats-from-github-or-cache.js";
import { getGithubToken } from "./github-token.js";
import { clearImagesForUsername, clearRendersForUsername } from "./store.js";

export const executeGitHubGraphQlQuery = async ({
  username,
  token,
  query,
}: {
  username: string | null;
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
  const rateLimit = res.headers.get("x-ratelimit-remaining");

  if (Number(rateLimit) < 1000) {
    console.warn(`GitHub GraphQL rate limit remaining: ${rateLimit}`);
  }

  const response = await res.json();
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

  if (username === null) {
    if (response.data) {
      return response.data.viewer;
    }

    throw new Error("Unexpected response from GitHub");
  }

  return response.data.user;
};

export const statsEndPoint = async (request: Request, response: Response) => {
  if (request.method === "OPTIONS") {
    return response.end();
  }

  try {
    const { username, refreshCache } = StatsRequest.parse(request.body);

    await getStatsFromGitHubOrCache({
      username,
      token: getGithubToken(),
      refreshCache,
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
