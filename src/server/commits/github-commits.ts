import type { DateRange } from "../../helpers/date-range.js";
import { searchDateRange } from "../../helpers/date-range.js";
import { badKeyError, rateLimitError } from "../api-errors.js";
import type { Commit, commits } from "./commits.js";
import { mapApiResponseToCommits } from "./map-api-response-to-commits.js";

const PER_PAGE = 100;

const getGithubCommits = async (
  username: string,
  page: number,
  token: string,
  range: DateRange,
) => {
  // author-date restricts the search to commits authored within the range (IST).
  const query = encodeURIComponent(
    `author:${username} merge:false author-date:${searchDateRange(range)}`,
  );
  const response = await fetch(
    `https://api.github.com/search/commits?q=${query}&sort=author-date&order=desc&page=${page}&per_page=${PER_PAGE}`,
    {
      method: "get",
      headers: {
        Authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
    },
  );

  const rateLimit = parseInt(
    response.headers.get("x-ratelimit-remaining") as string,
    10,
  );

  if (rateLimit < 10) {
    console.warn(`GitHub REST rate limit remaining: ${rateLimit}`);
  }

  // https://docs.github.com/en/rest/overview/rate-limits-for-the-rest-api?apiVersion=2022-11-28#exceeding-the-rate-limit
  const rateLimitHit = response.status === 403 || response.status === 429;

  if (rateLimitHit) {
    console.warn("GitHub REST rate limit hit");
    throw rateLimitError("search");
  }

  if (response.status === 401) {
    throw badKeyError();
  }

  if (response.status !== 200) {
    throw new TypeError((await response.json()).message);
  }

  const json = (await response.json()) as typeof commits;
  const listOfCommits = mapApiResponseToCommits(json, range);
  // A short page means there are no further results.
  const isDone = json.items.length < PER_PAGE;
  return {
    commits: listOfCommits,
    isDone,
  };
};

export const getALotOfGithubCommits = async (
  username: string,
  token: string,
  range: DateRange,
) => {
  const listOfCommits: Commit[] = [];

  const pages = [1, 2, 3];

  for (const page of pages) {
    const { commits, isDone } = await getGithubCommits(
      username,
      page,
      token,
      range,
    );
    listOfCommits.push(...commits);
    if (isDone) {
      break;
    }
  }

  return listOfCommits.filter((c) => !c.fork);
};
