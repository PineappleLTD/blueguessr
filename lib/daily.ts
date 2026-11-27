// The Daily BlueGuessr: one set of five photos for everyone, changing at midnight Ann Arbor time.
// Safe to import from client code.

export const DAILY_ROUND_SECONDS = 30;

/** Today's date in Ann Arbor: "2026-11-26". */
export function dailyDate(date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Detroit",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

/** "Nov 26" for a daily date. */
export function dailyLabel(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}
