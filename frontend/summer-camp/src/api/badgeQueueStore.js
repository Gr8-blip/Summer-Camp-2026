// A minimal pub/sub so plain JS (client.js) can notify React components
// without importing React. One publisher (the API client), any number of
// subscribers (in practice, just BadgeQueueProvider).

const subscribers = new Set();

export function publishBadges(badges) {
  if (!badges?.length) return;
  subscribers.forEach((cb) => cb(badges));
}

export function subscribeBadges(cb) {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}