import { createContext, useContext, useEffect, useState } from "react";
import { subscribeBadges } from "../api/badgeQueueStore";
import BadgeUnlockModal from "./BadgeUnlockModal";

const BadgeQueueContext = createContext(null);

export function BadgeQueueProvider({ children }) {
  const [queue, setQueue] = useState([]);

  useEffect(() => {
    return subscribeBadges((badges) => {
      setQueue((q) => [...q, ...badges]);
    });
  }, []);

  return (
    <BadgeQueueContext.Provider value={setQueue}>
      {children}
      <BadgeUnlockModal queue={queue} onAdvance={() => setQueue((q) => q.slice(1))} />
    </BadgeQueueContext.Provider>
  );
}

// Rarely needed directly (the client already auto-publishes new_badges from
// any API response) but exposed in case something needs to push a badge in
// manually, e.g. a locally-simulated unlock.
export function useBadgeQueue() {
  return useContext(BadgeQueueContext);
}