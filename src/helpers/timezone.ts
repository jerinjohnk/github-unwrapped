// All review dates and times use Indian Standard Time.
// IST is UTC+05:30 all year (no daylight saving), so a fixed offset is exact.

export const TIME_ZONE_LABEL = "IST";
export const TIME_ZONE_IANA = "Asia/Kolkata";
export const UTC_OFFSET = "+05:30";
const OFFSET_MS = (5 * 60 + 30) * 60_000;

/** Wall-clock date, hour and weekday (0 = Sunday) of an instant in IST. */
export const istParts = (instant: Date | number | string) => {
  const shifted = new Date(new Date(instant).getTime() + OFFSET_MS);
  return {
    date: shifted.toISOString().slice(0, 10),
    hour: shifted.getUTCHours(),
    weekday: shifted.getUTCDay(),
  };
};

/** Today's date in IST, as YYYY-MM-DD. */
export const istToday = (now = new Date()) => istParts(now).date;
