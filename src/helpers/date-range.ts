// Date ranges for the review period. Dates are inclusive "YYYY-MM-DD" strings
// in IST: a range runs from 00:00 IST on `from` to 24:00 IST on `to`.
//
// GitHub only returns contribution data for at most one year per request
// (`contributionsCollection`), so a range may span at most one calendar year:
// `to` must be before the same day one year after `from`.

import { z } from "zod";
import { UTC_OFFSET, istParts, istToday } from "./timezone.js";
import { YEAR_TO_REVIEW } from "./year.js";

export type DateRange = { from: string; to: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const parseIsoDate = (value: string): Date | null => {
  if (!ISO_DATE.test(value)) {
    return null;
  }

  const date = new Date(`${value}T00:00:00Z`);
  // Rejects dates like 2026-02-30, which Date would roll over.
  return Number.isNaN(date.getTime()) || toIsoDate(date) !== value
    ? null
    : date;
};

const toIsoDate = (date: Date) => date.toISOString().slice(0, 10);

const addDays = (value: string, days: number) => {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return toIsoDate(date);
};

const addYears = (value: string, years: number) => {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCFullYear(date.getUTCFullYear() + years);
  return toIsoDate(date);
};

/** Today's date in IST, as YYYY-MM-DD. */
export const today = istToday;

/** The latest allowed `to` for a range starting at `from`. */
export const maxRangeEnd = (from: string) => addDays(addYears(from, 1), -1);

export const dateRangeSchema = z
  .object({ from: z.string(), to: z.string() })
  .superRefine(({ from, to }, ctx) => {
    if (!parseIsoDate(from) || !parseIsoDate(to)) {
      ctx.addIssue({ code: "custom", message: "Dates must be YYYY-MM-DD." });
      return;
    }

    if (from > to) {
      ctx.addIssue({
        code: "custom",
        message: "The start date must be on or before the end date.",
      });
    }

    if (to > maxRangeEnd(from)) {
      ctx.addIssue({
        code: "custom",
        message: `GitHub limits a range to one year: the end date can be ${maxRangeEnd(
          from,
        )} at the latest.`,
      });
    }
  });

export const yearRange = (year: number): DateRange => ({
  from: `${year}-01-01`,
  to: `${year}-12-31`,
});

/** The range the original web app reviews: the whole of YEAR_TO_REVIEW. */
export const reviewYearRange = () => yearRange(YEAR_TO_REVIEW);

/**
 * Presets offered on the studio page. Same rules as Commitscape:
 * from 1 July onwards the default is this year so far, before that the whole of last year.
 */
export const rangePresets = (todayDate = istToday()) => {
  const year = Number(todayDate.slice(0, 4));
  const presets = [
    {
      id: "this-year",
      label: "This year so far",
      range: { from: `${year}-01-01`, to: todayDate },
    },
    { id: "last-year", label: "Last year", range: yearRange(year - 1) },
    {
      id: "last-12-months",
      label: "Last 12 months",
      range: { from: addDays(addYears(todayDate, -1), 1), to: todayDate },
    },
  ];
  const defaultId = todayDate.slice(5) >= "07-01" ? "this-year" : "last-year";
  return { presets, defaultId };
};

/**
 * True if a date ("YYYY-MM-DD", e.g. a contribution-calendar day) or an instant
 * (ISO timestamp with offset) falls inside the range, judged by its IST date.
 */
export const isInRange = (dateOrTimestamp: string, range: DateRange) => {
  const day = ISO_DATE.test(dateOrTimestamp)
    ? dateOrTimestamp
    : istParts(dateOrTimestamp).date;
  return day >= range.from && day <= range.to;
};

/** Range boundaries as IST datetimes (end is exclusive), for contributionsCollection. */
export const rangeStartDateTime = (range: DateRange) =>
  `${range.from}T00:00:00${UTC_OFFSET}`;
export const rangeEndDateTime = (range: DateRange) =>
  `${addDays(range.to, 1)}T00:00:00${UTC_OFFSET}`;

/** GitHub search qualifier value covering the range in IST, e.g. for created: or author-date:. */
export const searchDateRange = (range: DateRange) =>
  `${range.from}T00:00:00${UTC_OFFSET}..${range.to}T23:59:59${UTC_OFFSET}`;

/** Short label shown in the video: "2026", or "2025–26" when the range crosses a year. */
export const periodLabel = (range: DateRange) => {
  const fromYear = range.from.slice(0, 4);
  const toYear = range.to.slice(0, 4);
  return fromYear === toYear ? fromYear : `${fromYear}–${toYear.slice(2)}`;
};

/** Stable identifier for caching per range. */
export const rangeKey = (range: DateRange) => `${range.from}_${range.to}`;

/**
 * The range a request asks for. No `from`/`to` means the whole of YEAR_TO_REVIEW
 * (the original app's behaviour). Throws an Error with a readable message otherwise.
 */
export const resolveRange = (input: {
  from?: string;
  to?: string;
}): DateRange => {
  if (input.from === undefined && input.to === undefined) {
    return reviewYearRange();
  }

  const parsed = dateRangeSchema.safeParse({ from: input.from, to: input.to });
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(" "));
  }

  return parsed.data;
};
