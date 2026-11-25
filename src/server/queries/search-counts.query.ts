import type { DateRange } from "../../helpers/date-range.js";
import { searchDateRange } from "../../helpers/date-range.js";
import { executeRawGitHubGraphQlQuery } from "../fetch-stats.js";

/**
 * Pull requests and issues the user opened within the range (IST), with issues
 * split by their current state. Search counts are exact and need one request,
 * however many items the user has.
 */
export const getSearchCounts = async ({
  login,
  token,
  range,
}: {
  login: string;
  token: string;
  range: DateRange;
}) => {
  // GitHub logins only contain letters, digits and hyphens.
  if (!/^[A-Za-z0-9-]+$/.test(login)) {
    throw new Error(`Invalid GitHub login: ${login}`);
  }

  const filter = `author:${login} created:${searchDateRange(range)}`;
  const data = (await executeRawGitHubGraphQlQuery({
    token,
    query: `{
      pullRequests: search(query: "${filter} is:pr", type: ISSUE) { issueCount }
      openIssues: search(query: "${filter} is:issue is:open", type: ISSUE) { issueCount }
      closedIssues: search(query: "${filter} is:issue is:closed", type: ISSUE) { issueCount }
    }`,
  })) as {
    pullRequests: { issueCount: number };
    openIssues: { issueCount: number };
    closedIssues: { issueCount: number };
  } | null;

  return {
    pullRequests: data?.pullRequests.issueCount ?? 0,
    openIssues: data?.openIssues.issueCount ?? 0,
    closedIssues: data?.closedIssues.issueCount ?? 0,
  };
};
