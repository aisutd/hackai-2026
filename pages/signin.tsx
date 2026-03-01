import React, { useState, useEffect, useCallback, useRef } from "react";
import Navbar from "@/components/Navbar";
import { useRouter } from "next/router";
import { db, auth } from "@/firebase/clientApp";
import { collection, doc, getDoc, getDocs, limit, query, updateDoc, where } from "firebase/firestore";
import {
  createUserWithEmailAndPassword,
  deleteUser,
  fetchSignInMethodsForEmail,
  getAdditionalUserInfo,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import { isAdminEmail } from "@/utils/adminAccess";

const HACKERS_COLLECTION = "hackers";
type HackerMatch = {
  id: string;
  data: Record<string, unknown> & { hasLoggedIn?: boolean; hasLoggedin?: boolean; email?: string };
};

const getHasLoggedIn = (data: Record<string, unknown>): boolean => {
  return Boolean(data.hasLoggedIn) || Boolean(data.hasLoggedin);
};

const isValidEmail = (value: string): boolean => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);

const getPhoneFromData = (data: Record<string, unknown>): string => {
  const candidates = [data.phone_number, data.phoneNumber, data.phone];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return "";
};

const SignIn = () => {
  const router = useRouter();
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"register" | "login">("login");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const isAuthGuardPausedRef = useRef(false);

  const getHackersByEmail = useCallback(async (rawEmail: string): Promise<HackerMatch[]> => {
    const email = rawEmail.trim();
    if (!email) return [];
    const candidates = Array.from(new Set([email, email.toLowerCase()]));
    const seen = new Set<string>();
    const matches: HackerMatch[] = [];

    for (const candidate of candidates) {
      const snap = await getDocs(
        query(collection(db, HACKERS_COLLECTION), where("email", "==", candidate), limit(25))
      );

      for (const docSnap of snap.docs) {
        if (seen.has(docSnap.id)) continue;
        seen.add(docSnap.id);
        matches.push({
          id: docSnap.id,
          data: docSnap.data() as { hasLoggedIn?: boolean; hasLoggedin?: boolean; email?: string },
        });
      }
    }

    return matches;
  }, []);

  const findHackerByEmail = useCallback(async (rawEmail: string) => {
    const matches = await getHackersByEmail(rawEmail);
    if (matches.length === 0) return null;
    const registered = matches.find((item) => getHasLoggedIn(item.data));
    return (registered ?? matches[0]).data;
  }, [getHackersByEmail]);

  const resolveUserDestination = useCallback(async (rawEmail: string): Promise<"/userProfile" | "/completeProfile"> => {
    const matches = await getHackersByEmail(rawEmail);
    if (matches.length === 0) return "/completeProfile";
    const registered = matches.find((item) => getHasLoggedIn(item.data)) ?? matches[0];
    const hasPhone = Boolean(getPhoneFromData(registered.data));
    return hasPhone ? "/userProfile" : "/completeProfile";
  }, [getHackersByEmail]);

  const hasRegisteredHackerByEmail = useCallback(async (rawEmail: string, excludeDocId?: string) => {
    const matches = await getHackersByEmail(rawEmail);
    return matches.some((item) => item.id !== excludeDocId && getHasLoggedIn(item.data));
  }, [getHackersByEmail]);

  const enforceAllowedLogin = useCallback(async (rawEmail: string): Promise<"admin" | "user" | "blocked"> => {
    const email = rawEmail.trim().toLowerCase();
    if (!email) return "blocked";
    if (isAdminEmail(email)) return "admin";

    const hacker = await findHackerByEmail(email);
    if (hacker && getHasLoggedIn(hacker)) return "user";
    return "blocked";
  }, [findHackerByEmail]);

  // Redirect if already logged in
  useEffect(() => {
    let active = true;
    const unsubscribe = auth.onAuthStateChanged((user) => {
      const syncRoute = async () => {
        if (isAuthGuardPausedRef.current) return;
        if (!user) return;
        const destination = await enforceAllowedLogin(user.email || "");
        if (!active) return;
        if (destination === "admin") {
          router.replace("/admin/hackers");
          return;
        }
        if (destination === "user") {
          const nextRoute = await resolveUserDestination(user.email || "");
          router.replace(nextRoute);
          return;
        }
        await signOut(auth);
        setError("No account found. Please sign up first using your 6-digit code.");
      };

      void syncRoute();
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [enforceAllowedLogin, resolveUserDestination, router]);

  // Focus next/prev input on change and handle backspace
  const handleChange = (idx: number, value: string) => {
    if (!/^[0-9]?$/.test(value)) return;
    const newCode = [...code];
    newCode[idx] = value;
    setCode(newCode);
    if (value && idx < 5) {
      const next = document.getElementById(`code-input-${idx + 1}`);
      if (next) (next as HTMLInputElement).focus();
    }
  };

  // Handle backspace to move focus to previous input
  const handleKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !code[idx] && idx > 0) {
      const prev = document.getElementById(`code-input-${idx - 1}`);
      if (prev) {
        (prev as HTMLInputElement).focus();
        const newCode = [...code];
        newCode[idx - 1] = "";
        setCode(newCode);
        e.preventDefault();
      }
    }
  };

  // Validate code and fetch linked applicant email
  const validateCode = async (): Promise<{ ok: true; codeStr: string; applicantEmail: string } | { ok: false }> => {
    const codeStr = code.join("");
    if (codeStr.length !== 6) {
      setError("Please enter the 6-digit code.");
      return { ok: false };
    }
    setError("");
    setLoading(true);
    try {
      const docRef = doc(db, HACKERS_COLLECTION, codeStr);
      const docSnap = await getDoc(docRef);
      if (!docSnap.exists()) {
        setError("Invalid code. Please check and try again.");
        setLoading(false);
        return { ok: false };
      }
      const data = docSnap.data();
      if (getHasLoggedIn(data)) {
        setError("This code has already been used to register.");
        setLoading(false);
        return { ok: false };
      }
      const applicantEmail = String(data.email || "").trim().toLowerCase();
      if (!applicantEmail) {
        setError("No email is linked to this code.");
        setLoading(false);
        return { ok: false };
      }
      setEmail(applicantEmail);
      setLoading(false);
      return { ok: true, codeStr, applicantEmail };
    } catch {
      setError("Error verifying code. Please try again.");
      setLoading(false);
      return { ok: false };
    }
  };

  // Handle register/login submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "register") {
      const codeStr = code.join("");
      let normalizedEmail = "";

      if (codeStr.length !== 6) {
        setError("Please enter the 6-digit code to sign up.");
        return;
      }

      const codeResult = await validateCode();
      if (!codeResult.ok) return;
      normalizedEmail = codeResult.applicantEmail;

      if (!isValidEmail(normalizedEmail)) {
        setError("Invalid email. Please use the one you used on the application.");
        return;
      }
      if (password.length < 6) {
        setError("Password must be at least 6 characters.");
        return;
      }

      const applicantMatches = await getHackersByEmail(normalizedEmail);
      if (applicantMatches.length === 0) {
        setError("This email was not found in applications. Please use the email you applied with.");
        return;
      }

      if (await hasRegisteredHackerByEmail(normalizedEmail, codeStr.length === 6 ? codeStr : undefined)) {
        setError("This email already has an account. Please sign in instead.");
        return;
      }

      const existingMethods = await fetchSignInMethodsForEmail(auth, normalizedEmail);
      if (existingMethods.length > 0) {
        if (existingMethods.includes("google.com") && !existingMethods.includes("password")) {
          setError("This email is already registered with Google. Use Sign in with Google.");
        } else {
          setError("This email already has an account. Please sign in instead.");
        }
        return;
      }

      setError("");
      setLoading(true);
      try {
        isAuthGuardPausedRef.current = true;
        await createUserWithEmailAndPassword(auth, normalizedEmail, password);
        await Promise.all(
          applicantMatches.map((match) =>
            updateDoc(doc(db, HACKERS_COLLECTION, match.id), { hasLoggedIn: true })
          )
        );
        alert("Account created! You can now log in.");
        window.location.href = "/signin";
      } catch (err: unknown) {
        isAuthGuardPausedRef.current = false;
        const message = err instanceof Error ? err.message : "Error creating account. Try again.";
        setError(message);
      }
      setLoading(false);
    } else {
      // Login mode
      const normalizedEmail = email.trim().toLowerCase();
      if (!isValidEmail(normalizedEmail)) {
        setError("Invalid email.");
        return;
      }
      if (password.length < 6) {
        setError("Password must be at least 6 characters.");
        return;
      }
      setError("");
      setLoading(true);
      try {
        const result = await signInWithEmailAndPassword(auth, email, password);
        const destination = await enforceAllowedLogin(result.user.email || email);
        if (destination === "admin") {
          router.replace("/admin/hackers");
        } else if (destination === "user") {
          const nextRoute = await resolveUserDestination(result.user.email || email);
          router.replace(nextRoute);
        } else {
          await signOut(auth);
          setError("No account found. Please sign up first using your 6-digit code.");
        }
      } catch (err: unknown) {
        let message = "Error signing in. Try again.";
        const code =
          typeof err === "object" && err !== null && "code" in err
            ? String((err as { code: unknown }).code)
            : "";
        if (code === "auth/user-not-found") {
          message = "No account found. Please sign up first using your 6-digit code.";
        } else if (code === "auth/invalid-credential") {
          message = "Invalid password or credentials.";
        }
        setError(message);
      }
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError("");
    setLoading(true);
    try {
      isAuthGuardPausedRef.current = true;
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const result = await signInWithPopup(auth, provider);
      const email = (result.user.email || "").toLowerCase();
      const additionalInfo = getAdditionalUserInfo(result);
      const destination = await enforceAllowedLogin(email);
      if (destination === "blocked") {
        if (additionalInfo?.isNewUser) {
          try {
            await deleteUser(result.user);
          } catch {
            await signOut(auth);
          }
        } else {
          await signOut(auth);
        }
        setError("No account found. Please sign up first using your 6-digit code.");
        setLoading(false);
        return;
      }

      if (additionalInfo?.isNewUser && !adminEmail) {
        try {
          await deleteUser(result.user);
        } catch {
          await signOut(auth);
        }
        setError("No account found. Please sign up first using your 6-digit code.");
        setLoading(false);
        return;
      }

      if (destination === "admin") {
        router.replace("/admin/hackers");
      } else {
        const nextRoute = await resolveUserDestination(email);
        router.replace(nextRoute);
      }
    } catch (err: unknown) {
      const code = typeof err === "object" && err !== null && "code" in err ? String((err as { code: unknown }).code) : "";
      if (code === "auth/popup-closed-by-user") {
        setError("Google sign-in was cancelled.");
      } else if (code === "auth/account-exists-with-different-credential") {
        setError("This email already exists with password sign-in. Please use email and password.");
      } else {
        const message = err instanceof Error ? err.message : "Error signing in with Google. Try again.";
        setError(message);
      }
    }
    setLoading(false);
  };

  const handleGoogleRegister = async () => {
    setError("");

    const valid = await validateCode();
    if (!valid.ok) return;

    const codeStr = valid.codeStr;
    let expectedEmail = "";
    try {
      const codeSnap = await getDoc(doc(db, HACKERS_COLLECTION, codeStr));
      expectedEmail = String(codeSnap.data()?.email || "").trim().toLowerCase();
    } catch {
      setError("Unable to verify code email. Please try again.");
      return;
    }

    if (!isValidEmail(expectedEmail)) {
      setError("This code is not linked to a valid email account.");
      return;
    }

    if (await hasRegisteredHackerByEmail(expectedEmail, codeStr)) {
      setError("This email already has an account. Please sign in instead.");
      return;
    }

    const existingMethods = await fetchSignInMethodsForEmail(auth, expectedEmail);
    if (existingMethods.length > 0) {
      if (existingMethods.includes("password")) {
        setError("This email is already registered with email/password. Please sign in.");
      } else if (existingMethods.includes("google.com")) {
        setError("This email already has a Google account. Please use Sign in with Google.");
      } else {
        setError("This email already has an account. Please sign in instead.");
      }
      return;
    }

    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const result = await signInWithPopup(auth, provider);
      const googleEmail = (result.user.email || "").toLowerCase();
      const additionalInfo = getAdditionalUserInfo(result);
      const isNewUser = Boolean(additionalInfo?.isNewUser);

      if (!isValidEmail(googleEmail)) {
        if (isNewUser) {
          await deleteUser(result.user);
        } else {
          await signOut(auth);
        }
        isAuthGuardPausedRef.current = false;
        setError("Unable to determine a valid email from Google account.");
        setLoading(false);
        return;
      }

      if (googleEmail !== expectedEmail) {
        if (isNewUser) {
          await deleteUser(result.user);
        } else {
          await signOut(auth);
        }
        isAuthGuardPausedRef.current = false;
        setError(`This code is linked to ${expectedEmail}. Please use that email account.`);
        setLoading(false);
        return;
      }

      if (!isNewUser) {
        await signOut(auth);
        isAuthGuardPausedRef.current = false;
        setError("Google account already exists. Use Sign in with Google on the sign-in view.");
        setLoading(false);
        return;
      }

      await updateDoc(doc(db, HACKERS_COLLECTION, codeStr), { hasLoggedIn: true });
      router.replace("/completeProfile");
    } catch (err: unknown) {
      isAuthGuardPausedRef.current = false;
      const code =
        typeof err === "object" && err !== null && "code" in err
          ? String((err as { code: unknown }).code)
          : "";
      if (code === "auth/popup-closed-by-user") {
        setError("Google sign-up was cancelled.");
      } else if (code === "auth/account-exists-with-different-credential") {
        setError("This email already exists with password sign-in. Please use email and password.");
      } else {
        const message = err instanceof Error ? err.message : "Error signing up with Google. Try again.";
        setError(message);
      }
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <div style={{ height: '110px' }} />
      <div className="flex flex-1 items-center justify-center relative">
        {/* Background image */}
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
          className="rounded-2xl shadow-xl py-8 flex flex-col items-center relative z-10 text-white md:mt-4"
          style={{
            maxWidth: '650px',
            minWidth: '320px',
            width: '90%',
            background: 'linear-gradient(120deg, rgba(255,255,255,0.25) 0%, rgba(255,255,255,0.10) 100%)',
            boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.18)',
            backdropFilter: 'blur(18px) saturate(180%)',
            WebkitBackdropFilter: 'blur(18px) saturate(180%)',
            border: '.5px solid rgba(255,255,255,0.35)',
            outline: '1.5px solid rgba(255,255,255,0.18)'
          }}
        >
          <div className="w-full px-4 md:px-8">
            <form onSubmit={handleSubmit} className="w-full flex flex-col items-center">
          <h2 className="text-3xl font-bold mb-2 text-center">
            {mode === "register" ? "Create an account" : "Sign in"}
          </h2>
          <div className="mb-2 text-center text-gray-400">
            {mode === "register" ? (
              <>
                Already have an account?{' '}
                <span className="text-green-300 cursor-pointer underline" onClick={() => setMode("login")}>Sign in</span>
              </>
            ) : (
              <>
                Don&apos;t have an account?{" "}
                <span className="text-green-300 cursor-pointer underline" onClick={() => setMode("register")}>Sign up</span>
              </>
            )}
          </div>
          {/* 6-digit code input */}
          {mode === "register" && (
            <div className="w-full mb-4">
              <label className="block mb-2 text-left text-gray-300 font-semibold">
                Enter 6-digit login code (required)
              </label>
              <div className="flex gap-1 w-full" style={{flexWrap: 'nowrap', overflowX: 'auto', justifyContent: 'flex-start'}}>
                {code.map((digit, idx) => (
                  <input
                    key={idx}
                    id={`code-input-${idx}`}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    className={`w-10 h-12 text-lg text-center border-2 rounded-lg focus:outline-none transition-all bg-black/60 ${digit ? "border-green-500" : "border-gray-400"} sm:w-12 sm:h-14 w-8 h-10 text-base min-w-[2.2rem]`}
                    value={digit}
                    onChange={e => handleChange(idx, e.target.value)}
                    onKeyDown={e => handleKeyDown(idx, e)}
                    onFocus={e => e.target.select()}
                  />
                ))}
              </div>
            </div>
          )}
          {mode === "register" && (
            <>
              <button
                type="button"
                onClick={handleGoogleRegister}
                className="mb-4 w-full py-3 rounded-lg bg-white text-black font-semibold text-lg hover:bg-gray-200 transition disabled:opacity-70"
                disabled={loading}
              >
                {loading ? "Loading..." : "Sign up with Google"}
              </button>
              <div className="w-full text-center text-gray-300 text-sm mb-4 uppercase tracking-wider">
                or create with email and password
              </div>
            </>
          )}
          {mode === "login" && (
            <>
              <button
                type="button"
                onClick={handleGoogleSignIn}
                className="mb-4 w-full py-3 rounded-lg bg-white text-black font-semibold text-lg hover:bg-gray-200 transition disabled:opacity-70"
                disabled={loading}
              >
                {loading ? "Loading..." : "Continue with Google"}
              </button>
              <div className="w-full text-center text-gray-300 text-sm mb-4 uppercase tracking-wider">
                or sign in with email
              </div>
            </>
          )}
          {/* Email input (editable for both modes) */}
          <input
            type="email"
            placeholder="Enter your email address"
            className="mb-4 px-4 py-3 rounded-lg border border-gray-300 w-full text-lg focus:outline-none focus:ring-2 focus:ring-[#a259ff]"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Enter your password"
            className="mb-4 px-4 py-3 rounded-lg border border-gray-300 w-full text-lg focus:outline-none focus:ring-2 focus:ring-[#a259ff]"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
          <div className="w-full flex flex-col gap-2 mb-4">
            <button type="submit" className="w-full py-3 rounded-lg bg-[#2d0a4b] text-white font-semibold text-lg hover:bg-[#4b1c7a] transition" disabled={loading}>
              {loading ? "Loading..." : mode === "register" ? "Create Account" : "Sign In"}
            </button>
          </div>
          {error && <div className="text-red-500 mb-2 text-sm">{error}</div>}
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SignIn;
