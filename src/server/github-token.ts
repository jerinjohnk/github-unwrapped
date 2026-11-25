import { backendCredentials } from "../helpers/domain.js";
import { badKeyError } from "./api-errors.js";

export const hasEnvGithubToken = () =>
  Boolean(backendCredentials().GITHUB_TOKEN);

/** The key from .env; the /studio page can pass its own key instead. */
export const getGithubToken = (): string => {
  const token = backendCredentials().GITHUB_TOKEN;
  if (!token) {
    throw new Error(
      "No GitHub key: set GITHUB_TOKEN in .env, or enter a key on the /studio page.",
    );
  }

  return token;
};

/** Throws if GitHub rejects the key. /rate_limit does not count against the quota. */
export const verifyGithubToken = async (token: string) => {
  const res = await fetch("https://api.github.com/rate_limit", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) {
    throw badKeyError();
  }
};
