import type { DateRange } from "../helpers/date-range.js";
import { collectInRange } from "./collect-in-range.js";
import { executeGitHubGraphQlQuery } from "./fetch-stats.js";
import { getQuery } from "./queries/query.js";
import {
  getStarredReposQuery,
  type StarredReposQueryResponse,
} from "./queries/stars.query.js";

type StarEdge =
  StarredReposQueryResponse["starredRepositories"]["edges"][number];

/** Repositories the user starred within the range. */
export const getMoreStars = async ({
  username,
  token,
  range,
}: {
  username: string | null;
  token: string;
  range: DateRange;
}) => {
  const stars = await collectInRange<StarEdge>({
    range,
    maxPages: 10,
    dateOf: (edge) => edge.starredAt,
    fetchPage: async (cursor) => {
      const data = (await executeGitHubGraphQlQuery({
        username,
        token,
        query: getQuery(username, getStarredReposQuery(cursor)),
      })) as StarredReposQueryResponse;

      return {
        items: data.starredRepositories.edges,
        hasNextPage: data.starredRepositories.pageInfo.hasNextPage,
        endCursor: data.starredRepositories.pageInfo.endCursor,
      };
    },
  });

  return stars.map((s) => ({ name: s.node.name, owner: s.node.owner.login }));
};
