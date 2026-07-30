// Same minimal pub/sub as badgeQueueStore.js, just for coin events. Kept
// as a separate store (not merged into badgeQueueStore) since coins and
// badges pop up as visually distinct celebrations and can arrive
// independently — a quest can pay coins with zero new badges, or vice versa.

const subscribers = new Set();

export function publishCoins(coinEvents) {
  if (!coinEvents?.length) return;
  subscribers.forEach((cb) => cb(coinEvents));
}

export function subscribeCoins(cb) {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}