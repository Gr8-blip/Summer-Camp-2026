import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { verifyPayment } from "../api/client";
import "./PaymentCallback.css";

export default function PaymentCallback() {
  const { reference } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [status, setStatus] = useState("checking"); // checking | success | failed
  const [message, setMessage] = useState("");
  const [familyId, setFamilyId] = useState(null);

  useEffect(() => {
    let mounted = true;

    // PlanReview's popup flow already calls verify-payment before navigating
    // here — if that result is in router state, use it instead of hitting
    // the endpoint again (your backend handles double-verification fine via
    // the "already verified" short-circuit, but no need for the extra call).
    const preVerified = location.state?.preVerified;
    if (preVerified) {
      setStatus("success");
      setMessage(preVerified.message || "Payment verified!");
      setFamilyId(preVerified.family_id);
      return;
    }

    (async () => {
      try {
        const data = await verifyPayment(reference);
        if (!mounted) return;
        setStatus("success");
        setMessage(data.message || "Payment verified!");
        setFamilyId(data.family_id);
      } catch (err) {
        if (!mounted) return;
        setStatus("failed");
        setMessage(err.data?.message || err.message || "We couldn't verify your payment.");
      }
    })();

    return () => { mounted = false; };
  }, [reference, location.state]);

  return (
    <div className="page-shell callback-page">
      <div className="callback-card fade-up">
        {status === "checking" && (
          <>
            <div className="callback-spinner-big" />
            <h2>Verifying your payment...</h2>
            <p>Hang tight, this only takes a second! ⏳</p>
          </>
        )}

        {status === "success" && (
          <>
            <div className="callback-emoji">🎊</div>
            <h2>You're In!</h2>
            <p>{message}</p>
            <p className="callback-sub">
              Family #{familyId} is now active. Your kids' login codes have been generated —
              log in to your dashboard to find them.
            </p>
            <button className="btn btn-primary" onClick={() => navigate("/login")}>
              Go to Parent Login →
            </button>
          </>
        )}

        {status === "failed" && (
          <>
            <div className="callback-emoji">😬</div>
            <h2>Hmm, Something's Off</h2>
            <p>{message}</p>
            <button className="btn btn-primary" onClick={() => navigate(-1)}>
              Try Again
            </button>
          </>
        )}
      </div>
    </div>
  );
}
