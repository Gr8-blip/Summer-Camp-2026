// Single source of truth for bootcamp-wide info shown on dashboards.
// Update BOOTCAMP_START_DATE as the real date gets locked in.
export const BOOTCAMP_START_DATE = "2026-07-27T00:00:00";

export const ANNOUNCEMENTS = [
  "Welcome to the Bootcamp!",
  "Student login codes have been issued.",
  "More updates will appear here.",
];

export function getDaysUntil(dateString) {
  const target = new Date(dateString);
  const now = new Date();
  const diffMs = target - now;
  const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  return days;
}
