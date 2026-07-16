import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { verifyPayment } from "../api/client";
import "./PaymentCallback.css";

export default function PaymentCallback() {
  const { reference } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [status, setStatus] = useState("checking");
  const [message, setMessage] = useState("");
  const [familyId, setFamilyId] = useState(null);

  useEffect(() => {
    let mounted = true;
    const preVerified = location.state?.preVerified;
    if (preVerified) {
      setStatus("success"); setMessage(preVerified.message || "Payment verified!"); setFamilyId(preVerified.family_id);
      return;
    }
    (async () => {
      try {
        const data = await verifyPayment(reference);
        if (!mounted) return;
        setStatus("success"); setMessage(data.message || "Payment verified!"); setFamilyId(data.family_id);
      } catch (err) {
        if (!mounted) return;
        setStatus("failed"); setMessage(err.data?.message || err.message || "Could not verify payment.");
      }
    })();
    return () => { mounted = false; };
  }, [reference, location.state]);

  return (
    <div className="page-shell callback-page">
      <div className="callback-card fade-up">
        {status === "checking" && (<><div className="callback-spinner-big" /><h2>Verifying your payment...</h2><p>Hang tight! ⏳</p></>)}
        {status === "success" && (<><div className="callback-emoji">🎊</div><h2>You're In!</h2><p>{message}</p><p className="callback-sub">Family #{familyId} is now active. Log in to see your kids' login codes.</p><button className="btn btn-primary" onClick={() => navigate("/login")}>Go to Parent Login →</button></>)}
        {status === "failed" && (<><div className="callback-emoji">😬</div><h2>Something's Off</h2><p>{message}</p><button className="btn btn-primary" onClick={() => navigate(-1)}>Try Again</button></>)}
      </div>
    </div>
  );
}