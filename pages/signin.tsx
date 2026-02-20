import React, { useState } from "react";
import { useRouter } from "next/router";
import { GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { auth } from "@/firebase/clientApp";

const normalizeEmail = (value: string) => value.trim().toLowerCase();

export default function SignIn() {
  const router = useRouter();
  const [adminCode, setAdminCode] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleAdminLogin = async () => {
    const code = adminCode.trim();
    const email = adminEmail.trim();

    if (!code) {
      setError("Enter admin code.");
      return;
    }

    setError("");
    setLoading(true);

    if (code === "100000") {
      try {
        const bypassResponse = await fetch("/api/admin/session/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accessCode: code }),
        });

        const payload = (await bypassResponse.json()) as { error?: string };
        if (!bypassResponse.ok) {
          setError(payload.error || "Bypass code failed.");
          setLoading(false);
          return;
        }

        router.push("/scanner");
        return;
      } catch {
        setError("Bypass sign-in failed. Try again.");
        setLoading(false);
        return;
      }
    }

    if (!email) {
      setError("Enter admin email.");
      setLoading(false);
      return;
    }

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setError("Enter a valid admin email.");
      setLoading(false);
      return;
    }

    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });

      const credential = await signInWithPopup(auth, provider);
      const userEmail = normalizeEmail(credential.user.email || "");
      const expectedEmail = normalizeEmail(email);

      if (!userEmail || userEmail !== expectedEmail) {
        await signOut(auth);
        setError("Signed-in Google account does not match admin email.");
        setLoading(false);
        return;
      }

      const idToken = await credential.user.getIdToken(true);
      const response = await fetch("/api/admin/session/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idToken,
          accessCode: code,
          claimedEmail: expectedEmail,
        }),
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        await signOut(auth);
        setError(payload.error || "Unable to start admin session.");
        setLoading(false);
        return;
      }

      router.push("/scanner");
    } catch {
      setError("Sign-in failed. Try again.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative px-4">
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

      <div className="glass-card rounded-3xl shadow-xl p-8 w-full max-w-md text-white">
        <h1 className="text-3xl mb-2 text-center" style={{ fontFamily: "Street Flow NYC" }}>
          Admin Sign In
        </h1>
        <p className="text-sm text-center text-white/80 mb-6">
          Use admin code + admin email + Google. 
        </p>
        {/* Bypass code <code>100000</code> skips Google. */}

        <label className="block text-sm mb-2">Admin Code</label>
        <input
          type="password"
          value={adminCode}
          onChange={(event) => setAdminCode(event.target.value)}
          className="mb-4 px-4 py-3 rounded-lg border border-white/30 w-full text-base bg-black/30"
          placeholder="000000"
          autoComplete="one-time-code"
        />

        <label className="block text-sm mb-2">Admin Email</label>
        <input
          type="email"
          value={adminEmail}
          onChange={(event) => setAdminEmail(event.target.value)}
          className="mb-5 px-4 py-3 rounded-lg border border-white/30 w-full text-base bg-black/30"
          placeholder="admin@yourdomain.com"
          autoComplete="email"
        />

        {error ? <div className="text-red-300 text-sm mb-4">{error}</div> : null}

        <button
          type="button"
          onClick={handleAdminLogin}
          disabled={loading}
          className="w-full py-3 rounded-lg bg-[#2d0a4b] text-white font-semibold text-base hover:bg-[#4b1c7a] transition disabled:opacity-60"
        >
          {loading ? "Checking..." : "Sign In With Google"}
        </button>
      </div>
    </div>
  );
}
