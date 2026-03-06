import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { auth } from "@/firebase/clientApp";
import { sendEmailVerification, signOut } from "firebase/auth";
import Navbar from "@/components/Navbar";

const VerifyEmail = () => {
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  // If no user or already verified, redirect
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (!user) {
        router.replace("/signin");
        return;
      }
      if (user.emailVerified) {
        router.replace("/completeProfile");
      }
    });
    return () => unsubscribe();
  }, [router]);

  const handleResend = async () => {
    setError("");
    setMessage("");
    const user = auth.currentUser;
    if (!user) return;
    setSending(true);
    try {
      await sendEmailVerification(user);
      setMessage("Verification email sent! Check your inbox.");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unable to send verification email.";
      setError(message);
    }
    setSending(false);
  };

  const handleCheckVerification = async () => {
    setError("");
    setMessage("");
    const user = auth.currentUser;
    if (!user) return;
    setChecking(true);
    try {
      await user.reload();
      if (user.emailVerified) {
        router.replace("/completeProfile");
      } else {
        setError("Email not verified yet. Please check your inbox and click the verification link.");
      }
    } catch {
      setError("Unable to check verification status. Please try again.");
    }
    setChecking(false);
  };

  const handleSignOut = async () => {
    await signOut(auth);
    router.replace("/signin");
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <div style={{ height: "110px" }} />
      <div className="flex flex-1 items-center justify-center relative">
        <div
          className="fixed inset-0 -z-10"
          style={{
            backgroundColor: "black",
            backgroundImage: "url(/mainbg.svg)",
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
          }}
        />
        <div
          className="rounded-2xl shadow-xl py-8 px-4 md:px-8 flex flex-col items-center relative z-10 text-white"
          style={{
            maxWidth: "550px",
            minWidth: "320px",
            width: "90%",
            background:
              "linear-gradient(120deg, rgba(255,255,255,0.25) 0%, rgba(255,255,255,0.10) 100%)",
            boxShadow: "0 8px 32px 0 rgba(31, 38, 135, 0.18)",
            backdropFilter: "blur(18px) saturate(180%)",
            WebkitBackdropFilter: "blur(18px) saturate(180%)",
            border: ".5px solid rgba(255,255,255,0.35)",
            outline: "1.5px solid rgba(255,255,255,0.18)",
          }}
        >
          <h2 className="text-3xl font-bold mb-4 text-center">Verify Your Email</h2>
          <p className="text-gray-300 text-center mb-6">
            We sent a verification link to <strong>{auth.currentUser?.email}</strong>. Please check
            your inbox (and spam folder) and click the link to verify your account.
          </p>

          <button
            type="button"
            onClick={handleCheckVerification}
            disabled={checking}
            className="w-full py-3 rounded-lg bg-[#2d0a4b] text-white font-semibold text-lg hover:bg-[#4b1c7a] transition disabled:opacity-70 mb-3"
          >
            {checking ? "Checking..." : "I've Verified My Email"}
          </button>

          <button
            type="button"
            onClick={handleResend}
            disabled={sending}
            className="w-full py-3 rounded-lg bg-white/10 border border-white/20 text-white font-semibold text-lg hover:bg-white/20 transition disabled:opacity-70 mb-3"
          >
            {sending ? "Sending..." : "Resend Verification Email"}
          </button>

          <button
            type="button"
            onClick={handleSignOut}
            className="w-full py-3 rounded-lg bg-transparent border border-white/20 text-gray-300 font-semibold text-lg hover:bg-white/10 transition"
          >
            Sign Out
          </button>

          {message && <div className="mt-4 text-green-300 text-sm text-center">{message}</div>}
          {error && <div className="mt-4 text-red-400 text-sm text-center">{error}</div>}
        </div>
      </div>
    </div>
  );
};

export default VerifyEmail;
