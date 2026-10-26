/** Compact time labels for the sidebar chat list */

const DAY = 24 * 60 * 60 * 1000;

/** "now", "12m", "5h", "3d", then "Sep 4" */
export function compactAge(date: Date, now = new Date()): string {
  const ms = now.getTime() - date.getTime();
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(ms / DAY);
  if (days < 7) return `${days}d`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Today / Yesterday / Previous 7 days / Older, by calendar day */
export function dateGroup(date: Date, now = new Date()): string {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const t = date.getTime();
  if (t >= startOfToday.getTime()) return "Today";
  if (t >= startOfToday.getTime() - DAY) return "Yesterday";
  if (t >= startOfToday.getTime() - 7 * DAY) return "Previous 7 days";
  return "Older";
}
