import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { initPayment, verifyPayment } from "../api/client";
import AuthNav from "../components/AuthNav";
import "./PlanReview.css";

const PAYSTACK_PUBLIC_KEY = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY;

export default function PlanReview() {
  const { familyId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");
  const [amount, setAmount] = useState(null);

  const handlePay = async () => {
    setLoading(true);
    setError("");

    try {
      const data = await initPayment(familyId);

      if (!data.reference) {
        setError(data.message || "Couldn't start payment. Try again!");
        setLoading(false);
        return;
      }

      setAmount(data.amount);

      if (typeof window.PaystackPop === "undefined") {
        setError("Payment popup failed to load. Check your connection and refresh.");
        setLoading(false);
        return;
      }

      const handler = window.PaystackPop.setup({
        key: PAYSTACK_PUBLIC_KEY,
        email: data.email,
        amount: data.amount * 100, // Paystack expects kobo, same as your backend payload
        ref: data.reference,

        callback: function (response) {
          setVerifying(true);
          verifyPayment(response.reference)
            .then((result) => {
              navigate(`/payment/callback/${response.reference}`, {
                state: { preVerified: result },
              });
            })
            .catch(() => {
              setVerifying(false);
              setError("Payment went through but we couldn't confirm it. Contact support with this reference: " + response.reference);
            });
        },

        onClose: function () {
          setLoading(false);
        },
      });

      handler.openIframe();
      setLoading(false);
    } catch (err) {
      setError(err.data?.error || err.data?.message || err.message || "Something went wrong.");
      setLoading(false);
    }
  };

  return (
    <div className="page-shell plan-page">
      <div className="blob plan-blob-1" style={{ background: "var(--color-green)" }} />
      <div className="blob plan-blob-2" style={{ background: "var(--color-pink)" }} />

      <AuthNav />

      <div className="container plan-container fade-up">
        <div className="plan-card">
          <div className="plan-emoji">🎉</div>
          <h2>You're Almost In!</h2>
          <p className="plan-sub">
            Registration locked in for your family. One last step —
            complete payment to activate your spot in the bootcamp.
          </p>

          <div className="plan-info-box">
            <div className="plan-info-row">
              <span>📦 What's included</span>
              <span>Full bootcamp access + project build + Demo Day</span>
            </div>
            <div className="plan-info-row">
              <span>👥 Group sizing</span>
              <span>Students grouped in 3s for live sessions</span>
            </div>
            {amount !== null && (
              <div className="plan-info-row">
                <span>💰 Total</span>
                <span className="plan-amount">₦{Number(amount).toLocaleString()}</span>
              </div>
            )}
            <div className="plan-info-row">
              <span>💳 Payment</span>
              <span>Secure popup checkout via Paystack</span>
            </div>
          </div>

          {error && <div className="error-text plan-error">⚠️ {error}</div>}

          <button className="btn btn-primary btn-block plan-pay-btn" onClick={handlePay} disabled={loading || verifying}>
            {loading ? <span className="spinner" /> : verifying ? "Confirming payment..." : "💳 Pay Now"}
          </button>

          <p className="plan-note">A secure Paystack popup will open right here — no redirect.</p>
        </div>
      </div>
    </div>
  );
}
