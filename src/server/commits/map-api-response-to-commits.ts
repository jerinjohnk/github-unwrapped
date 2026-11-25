import type { DateRange } from "../../helpers/date-range.js";
import { isInRange } from "../../helpers/date-range.js";
import { istParts } from "../../helpers/timezone.js";
import type { Commit, commits } from "./commits.js";

type CommitsApiResponse = typeof commits;

export const mapApiResponseToCommits = (
  commitApiResponse: CommitsApiResponse,
  range: DateRange,
): Commit[] => {
  return commitApiResponse.items
    .map((commit): Commit | null => {
      if (!commit.author) {
        return null;
      }

      const { date } = commit.commit.author;
      if (!isInRange(date, range)) {
        return null;
      }

      const timestamp = new Date(date).getTime();
      if (Number.isNaN(timestamp)) {
        return null;
      }

      return {
        author: commit.author.login,
        date: timestamp,
        // Hour of day in IST, whatever timezone the commit was made in.
        hour: istParts(timestamp).hour,
        message: commit.commit.message,
        repo: commit.repository.owner.login + "/" + commit.repository.name,
        fork: commit.repository.fork,
      };
    })
    .filter(Boolean) as Commit[];
};
