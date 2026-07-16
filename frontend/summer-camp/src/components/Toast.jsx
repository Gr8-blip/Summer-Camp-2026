import { useState, useCallback } from "react";

export function useToast() {
  const [toasts, setToasts] = useState([]);

  const toast = useCallback((message, type = "success") => {
    const id = Date.now();
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

  return { toasts, toast };
}

export function ToastContainer({ toasts }) {
  if (!toasts.length) return null;
  return (
    <div className="a-toast-wrap">
      {toasts.map((t) => (
        <div key={t.id} className={`a-toast a-toast-${t.type}`}>
          {t.type === "success" ? "✅" : "⚠️"} {t.message}
        </div>
      ))}
    </div>
  );
}
