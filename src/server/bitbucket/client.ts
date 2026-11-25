// Minimal Bitbucket Cloud REST API 2.0 client.
//
// Authentication uses an Atlassian API token with scopes, sent as HTTP Basic
// auth with the Atlassian account email as the username. Needed scopes (all
// read-only): read:user:bitbucket, read:workspace:bitbucket,
// read:repository:bitbucket and read:pullrequest:bitbucket.

import { UserFacingError } from "../api-errors.js";

const API_ORIGIN = "https://api.bitbucket.org";
const API = `${API_ORIGIN}/2.0`;

export type BitbucketAuth = { email: string; token: string };

export type Paginated<T> = { values: T[]; next?: string };

export const REQUIRED_SCOPES = [
  "read:user:bitbucket",
  "read:workspace:bitbucket",
  "read:repository:bitbucket",
  "read:pullrequest:bitbucket",
];

/** A request Bitbucket refused for one resource (e.g. a repository the key can't read). */
export class BitbucketNotAllowedError extends Error {
  constructor(public status: number) {
    super(`Bitbucket refused the request (${status})`);
  }
}

/**
 * Counts requests so one fetch stays well inside Bitbucket's rate limit
 * (about 1,000 repository requests per hour per user).
 */
export class RequestBudget {
  used = 0;

  constructor(public readonly limit: number) {}

  get exhausted() {
    return this.used >= this.limit;
  }
}

const RETRIES = 3;
const TIMEOUT_MS = 30_000;
const TRANSIENT_STATUS = new Set([502, 503, 504]);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A fetch of hundreds of requests sees the odd timeout or 5xx: retry those. */
const fetchWithRetry = async (url: URL, headers: Record<string, string>) => {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!TRANSIENT_STATUS.has(res.status) || attempt === RETRIES) {
        return res;
      }
    } catch (err) {
      if (attempt === RETRIES) {
        throw new Error(
          `Could not reach Bitbucket (${(err as Error).message}). Check your connection and try again.`,
        );
      }
    }

    await sleep(1000 * 2 ** (attempt - 1));
  }
};

const bitbucketRequest = async (
  auth: BitbucketAuth,
  pathOrNextUrl: string,
  budget: RequestBudget,
  params: Record<string, string | string[]>,
  accept: string,
): Promise<Response> => {
  const url = pathOrNextUrl.startsWith("https://")
    ? new URL(pathOrNextUrl)
    : new URL(API + pathOrNextUrl);

  // `next` links come from the response; never send the key anywhere else.
  if (url.origin !== API_ORIGIN) {
    throw new Error(`Unexpected Bitbucket URL: ${url.origin}`);
  }

  for (const [name, value] of Object.entries(params)) {
    for (const v of Array.isArray(value) ? value : [value]) {
      url.searchParams.append(name, v);
    }
  }

  budget.used++;
  const res = await fetchWithRetry(url, {
    Authorization: `Basic ${Buffer.from(`${auth.email}:${auth.token}`).toString("base64")}`,
    Accept: accept,
  });

  if (res.status === 401) {
    throw new UserFacingError(
      "Bitbucket rejected the email and API token (401). Check that the email is your Atlassian account email and the token is correct and not expired.",
      401,
    );
  }

  if (res.status === 429) {
    throw new UserFacingError(
      "Bitbucket's rate limit was hit (about 1,000 requests an hour). Wait a while and try again.",
      429,
    );
  }

  if (res.status === 403 || res.status === 404) {
    throw new BitbucketNotAllowedError(res.status);
  }

  if (!res.ok) {
    throw new Error(`Bitbucket API error ${res.status} for ${url.pathname}`);
  }

  return res;
};

export const bitbucketGet = async <T>(
  auth: BitbucketAuth,
  pathOrNextUrl: string,
  budget: RequestBudget,
  params: Record<string, string | string[]> = {},
): Promise<T> => {
  const res = await bitbucketRequest(
    auth,
    pathOrNextUrl,
    budget,
    params,
    "application/json",
  );
  return (await res.json()) as T;
};

/** For endpoints that return plain text, such as a commit's diff. */
export const bitbucketGetText = async (
  auth: BitbucketAuth,
  path: string,
  budget: RequestBudget,
): Promise<string> => {
  const res = await bitbucketRequest(auth, path, budget, {}, "text/plain");
  return res.text();
};

/**
 * Reads pages until `shouldStop` says the rest is not needed, there are no more
 * pages, `maxPages` is reached or the request budget runs out.
 */
export const bitbucketPages = async <T>({
  auth,
  path,
  params,
  budget,
  maxPages,
  shouldStop,
}: {
  auth: BitbucketAuth;
  path: string;
  params: Record<string, string | string[]>;
  budget: RequestBudget;
  maxPages: number;
  shouldStop?: (page: T[]) => boolean;
}): Promise<{ values: T[]; complete: boolean }> => {
  const values: T[] = [];
  let next: string | undefined;

  for (let page = 0; page < maxPages; page++) {
    if (budget.exhausted) {
      return { values, complete: false };
    }

    const data: Paginated<T> = next
      ? await bitbucketGet(auth, next, budget)
      : await bitbucketGet(auth, path, budget, params);

    values.push(...data.values);
    if (!data.next || shouldStop?.(data.values)) {
      return { values, complete: true };
    }

    next = data.next;
  }

  return { values, complete: false };
};
