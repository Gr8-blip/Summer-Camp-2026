import { createContext, useContext, useEffect, useState } from "react";
import { subscribeCoins } from "../api/coinQueueStore";
import CoinPopup from "./Coinpopup";

const CoinQueueContext = createContext(null);

export function CoinQueueProvider({ children }) {
  const [queue, setQueue] = useState([]);

  useEffect(() => {
    return subscribeCoins((coinEvents) => {
      setQueue((q) => [...q, ...coinEvents]);
    });
  }, []);

  return (
    <CoinQueueContext.Provider value={setQueue}>
      {children}
      <CoinPopup queue={queue} onAdvance={() => setQueue((q) => q.slice(1))} />
    </CoinQueueContext.Provider>
  );
}

// Rarely needed directly (client.js already auto-publishes coin_events from
// any API response) but exposed in case something needs to push a coin
// popup in manually.
export function useCoinQueue() {
  return useContext(CoinQueueContext);
}