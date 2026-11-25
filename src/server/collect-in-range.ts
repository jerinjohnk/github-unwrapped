import type { DateRange } from "../helpers/date-range.js";

/**
 * Pages through a list GitHub returns newest-first and keeps the items whose date
 * falls inside the range: items after `to` are skipped, and paging stops at the
 * first item before `from` (everything after it is older still).
 */
export const collectInRange = async <T>({
  range,
  maxPages,
  fetchPage,
  dateOf,
}: {
  range: DateRange;
  maxPages: number;
  fetchPage: (cursor: string | null) => Promise<{
    items: T[];
    hasNextPage: boolean;
    endCursor: string | null;
  }>;
  dateOf: (item: T) => string;
}): Promise<T[]> => {
  const collected: T[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < maxPages; page++) {
    const { items, hasNextPage, endCursor } = await fetchPage(cursor);

    for (const item of items) {
      const day = dateOf(item).slice(0, 10);
      if (day < range.from) {
        return collected;
      }

      if (day <= range.to) {
        collected.push(item);
      }
    }

    if (!hasNextPage) {
      break;
    }

    cursor = endCursor;
  }

  return collected;
};
