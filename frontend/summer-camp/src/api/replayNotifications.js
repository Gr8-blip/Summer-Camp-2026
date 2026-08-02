import { getNotifications, markNotificationsRead } from "./client";
import { publishBadges } from "./badgeQueueStore";
import { publishCoins } from "./coinQueueStore";

export async function replayMissedNotifications() {
  const { notifications } = await getNotifications(true); // unread only
  if (!notifications.length) return;

  const badges = notifications.filter((n) => n.kind === "badge").map((n) => n.payload);
  const coins  = notifications.filter((n) => n.kind === "coins").map((n) => n.payload);

  if (badges.length) publishBadges(badges);
  if (coins.length) publishCoins(coins);

  await markNotificationsRead(notifications.map((n) => n.id));
}