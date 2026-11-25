import type { DateRange } from "../../helpers/date-range.js";
import {
  rangeEndDateTime,
  rangeStartDateTime,
} from "../../helpers/date-range.js";

// Nested in user(login: …) or viewer. Issue counts are fetched separately
// with a date-filtered search (see issues.query.ts).
export const baseQuery = (range: DateRange) => `
avatarUrl
login
contributionsCollection(
	from: "${rangeStartDateTime(range)}"
	to: "${rangeEndDateTime(range)}"
) {
	totalCommitContributions
	restrictedContributionsCount
	totalIssueContributions
	totalCommitContributions
	totalRepositoryContributions
	totalPullRequestContributions
	totalPullRequestReviewContributions
	popularPullRequestContribution {
		pullRequest {
			id
			title
			repository {
				name
				owner {
					login
				}
			}
		}
	}
	contributionCalendar {
		totalContributions
		weeks {
			contributionDays {
			  contributionCount
			  date
			}
		}  
	}
	commitContributionsByRepository {
		contributions {
			totalCount
		}
		repository {
			name
			owner {
				login
			}
			languages(first: 5, orderBy: {field: SIZE, direction: DESC}) {
				edges {
					size
					node {
						color
						name
						id
					}
				}
			}
		}
	}
}
`;

export type BaseQueryResponse = {
  avatarUrl: string;
  login: string;
  contributionsCollection: {
    contributionCalendar: {
      totalContributions: number;
      weeks: {
        contributionDays: {
          contributionCount: number;
          date: string;
        }[];
      }[];
    };
    commitContributionsByRepository: Array<{
      contributions: {
        totalCount: number;
      };
      repository: {
        languages: {
          edges: Array<{
            size: number;
            node: {
              color: string | null;
              name: string;
              id: string;
            };
          }>;
        };
      };
    }>;
  };
};
