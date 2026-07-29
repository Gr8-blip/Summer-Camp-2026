import { useEffect, useState } from "react";
import { getMarketplace, purchaseCosmetic, equipCosmetic } from "../../api/client";
import { useTheme } from "../../context/ThemeContext";
import StudentLayout from "./StudentLayout";
import Avatar from "../../components/Avatar";
import "./student.css";
import "./marketplace.css";

const CATEGORY_META = {
  avatar: { title: "🧑‍🚀 Avatars", subtitle: "Your look across the whole platform" },
  theme: { title: "🎨 Themes", subtitle: "Restyle the entire app" },
  victory_effect: { title: "✨ Victory Effects", subtitle: "Celebrate every win in style" },
};

export default function Marketplace() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [toast, setToast] = useState("");
  const { setTheme } = useTheme();

  const load = () => {
    getMarketplace()
      .then(setData)
      .catch((err) => setError(err.data?.detail || "Couldn't load the marketplace."));
  };

  useEffect(load, []);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2200);
  };

  const handlePurchase = async (item) => {
    setBusyId(item.id);
    try {
      await purchaseCosmetic(item.id);
      showToast(`${item.name} unlocked! 🎉`);
      load();
    } catch (err) {
      showToast(err.data?.detail || "Purchase failed.");
    } finally {
      setBusyId(null);
    }
  };

  const handleEquip = async (item) => {
    setBusyId(item.id);
    try {
      await equipCosmetic(item.id);
      if (item.category === "theme") setTheme(item.key); // instant global re-skin
      showToast(`${item.name} equipped!`);
      load();
    } catch (err) {
      showToast(err.data?.detail || "Equip failed.");
    } finally {
      setBusyId(null);
    }
  };

  if (error) {
    return (
      <StudentLayout title="🛒 Marketplace">
        <div className="s-error">{error}</div>
      </StudentLayout>
    );
  }

  if (!data) {
    return (
      <StudentLayout title="🛒 Marketplace">
        <div className="s-loading"><span className="spinner spinner-dark" /><span>Loading the shop...</span></div>
      </StudentLayout>
    );
  }

  const grouped = ["avatar", "theme", "victory_effect"].map((cat) => ({
    cat,
    items: data.items.filter((i) => i.category === cat),
  }));

  return (
    <StudentLayout title="🛒 Marketplace">
      <div className="mkt-wrapper">
        <div className="mkt-coin-bar">
          <span className="mkt-coin-icon">🪙</span>
          <span className="mkt-coin-total">{data.coins.toLocaleString()}</span>
          <span className="mkt-coin-label">Coins</span>
        </div>

        {grouped.map(({ cat, items }) => (
          <section key={cat} className="mkt-section">
            <div className="mkt-section-head">
              <h3>{CATEGORY_META[cat].title}</h3>
              <p>{CATEGORY_META[cat].subtitle}</p>
            </div>
            <div className="mkt-grid">
              {items.map((item) => (
                <div key={item.id} className={`mkt-card mkt-${item.status}`}>
                  <div className="mkt-card-icon">
                    {cat === "avatar" ? <Avatar avatarKey={item.key} size={40} /> : (
                      <span className="mkt-emoji">{item.name.split(" ")[0]}</span>
                    )}
                  </div>
                  <div className="mkt-card-name">{item.name.replace(/^\S+\s/, "")}</div>

                  {item.status === "locked" && (
                    <>
                      <div className="mkt-price">🪙 {item.price}</div>
                      <button
                        className="btn btn-primary mkt-btn"
                        disabled={busyId === item.id || data.coins < item.price}
                        onClick={() => handlePurchase(item)}
                      >
                        {busyId === item.id ? "..." : data.coins < item.price ? "Not enough coins" : "Unlock"}
                      </button>
                    </>
                  )}

                  {item.status === "owned" && (
                    <button
                      className="btn btn-secondary mkt-btn"
                      disabled={busyId === item.id}
                      onClick={() => handleEquip(item)}
                    >
                      {busyId === item.id ? "..." : "Equip"}
                    </button>
                  )}

                  {item.status === "equipped" && (
                    <span className="mkt-equipped-tag">✔ Equipped</span>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}

        {toast && <div className="mkt-toast">{toast}</div>}
      </div>
    </StudentLayout>
  );
}