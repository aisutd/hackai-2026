import React, { useState, useEffect, useCallback, useRef } from "react";
import Navbar from "@/components/Navbar";
import { useRouter } from "next/router";
import { db, auth } from "@/firebase/clientApp";
import { collection, doc, getDoc, getDocs, limit, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";
import {
  createUserWithEmailAndPassword,
  deleteUser,
  getAdditionalUserInfo,
  GoogleAuthProvider,
  sendEmailVerification,
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

        // If email/password user hasn't verified email, send them to verify page
        const isPasswordProvider = user.providerData.some((p) => p.providerId === "password");
        if (isPasswordProvider && !user.emailVerified) {
          router.replace("/verify-email");
          return;
        }

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
        setError("No account found. Please sign up first.");
      };

      void syncRoute();
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [enforceAllowedLogin, resolveUserDestination, router]);

  const generateUniqueAccessCode = async (): Promise<string> => {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const accessCode = String(Math.floor(100000 + Math.random() * 900000));
      const existing = await getDoc(doc(db, HACKERS_COLLECTION, accessCode));
      if (!existing.exists()) return accessCode;
    }
    throw new Error("Unable to generate a unique access code. Try again.");
  };

  const createHackerDoc = async (email: string): Promise<void> => {
    const accessCode = await generateUniqueAccessCode();
    await setDoc(doc(db, HACKERS_COLLECTION, accessCode), {
      access_code: accessCode,
      email,
      fname: "",
      lname: "",
      status: "rejected",
      foodGroup: "A",
      hasLoggedIn: true,
      isCheckedIn: false,
      breakfast: false,
      dinner: false,
      lunchd1: false,
      lunchd2: false,
      scanCount: 0,
      scans: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  };

  // Handle register/login submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "register") {
      const normalizedEmail = email.trim().toLowerCase();

      if (!isValidEmail(normalizedEmail)) {
        setError("Please enter a valid email address.");
        return;
      }
      if (password.length < 6) {
        setError("Password must be at least 6 characters.");
        return;
      }

      setError("");
      setLoading(true);
      try {
        isAuthGuardPausedRef.current = true;
        const cred = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
        await sendEmailVerification(cred.user);
        const existingMatches = await getHackersByEmail(normalizedEmail);
        if (existingMatches.length === 0) {
          await createHackerDoc(normalizedEmail);
        } else {
          const primary = existingMatches.find((item) => getHasLoggedIn(item.data)) ?? existingMatches[0];
          if (!getHasLoggedIn(primary.data)) {
            await updateDoc(doc(db, HACKERS_COLLECTION, primary.id), { hasLoggedIn: true });
          }
        }
        isAuthGuardPausedRef.current = false;
        router.replace("/verify-email");
      } catch (err: unknown) {
        const errCode =
          typeof err === "object" && err !== null && "code" in err
            ? String((err as { code: unknown }).code)
            : "";
        if (errCode === "auth/email-already-in-use") {
          try {
            await signInWithEmailAndPassword(auth, normalizedEmail, password);
            const existingMatches = await getHackersByEmail(normalizedEmail);
            if (existingMatches.length === 0) {
              await createHackerDoc(normalizedEmail);
            } else {
              const primary = existingMatches.find((item) => getHasLoggedIn(item.data)) ?? existingMatches[0];
              if (!getHasLoggedIn(primary.data)) {
                await updateDoc(doc(db, HACKERS_COLLECTION, primary.id), { hasLoggedIn: true });
              }
            }
            isAuthGuardPausedRef.current = false;
            const nextRoute = await resolveUserDestination(normalizedEmail);
            router.replace(nextRoute);
          } catch (signInErr: unknown) {
            isAuthGuardPausedRef.current = false;
            const signInCode =
              typeof signInErr === "object" && signInErr !== null && "code" in signInErr
                ? String((signInErr as { code: unknown }).code)
                : "";
            if (signInCode === "auth/invalid-credential" || signInCode === "auth/wrong-password") {
              setError("Account already exists. Use the correct password or sign in.");
            } else {
              const message =
                signInErr instanceof Error ? signInErr.message : "Unable to finish signup. Please try again.";
              setError(message);
            }
          }
        } else {
          isAuthGuardPausedRef.current = false;
          const message = err instanceof Error ? err.message : "Error creating account. Try again.";
          setError(message);
        }
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
        const result = await signInWithEmailAndPassword(auth, normalizedEmail, password);
        const destination = await enforceAllowedLogin(result.user.email || normalizedEmail);
        if (destination === "admin") {
          router.replace("/admin/hackers");
        } else if (destination === "user") {
          const nextRoute = await resolveUserDestination(result.user.email || normalizedEmail);
          router.replace(nextRoute);
        } else {
          await signOut(auth);
          setError("No account found. Please sign up first.");
        }
      } catch (err: unknown) {
        let message = "Error signing in. Try again.";
        const code =
          typeof err === "object" && err !== null && "code" in err
            ? String((err as { code: unknown }).code)
            : "";
        if (code === "auth/user-not-found") {
          message = "No account found. Please sign up first.";
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
      const adminEmail = isAdminEmail(email);
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
        isAuthGuardPausedRef.current = false;
        setError("No account found. Please sign up first.");
        setLoading(false);
        return;
      }

      if (additionalInfo?.isNewUser && !adminEmail) {
        try {
          await deleteUser(result.user);
        } catch {
          await signOut(auth);
        }
        isAuthGuardPausedRef.current = false;
        setError("No account found. Please sign up first.");
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
      isAuthGuardPausedRef.current = false;
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
    setLoading(true);
    try {
      isAuthGuardPausedRef.current = true;
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

      const matches = await getHackersByEmail(googleEmail);
      if (matches.length === 0) {
        await createHackerDoc(googleEmail);
      } else {
        const primary = matches.find((item) => getHasLoggedIn(item.data)) ?? matches[0];
        if (!getHasLoggedIn(primary.data)) {
          await updateDoc(doc(db, HACKERS_COLLECTION, primary.id), { hasLoggedIn: true });
        }
      }

      isAuthGuardPausedRef.current = false;
      const nextRoute = await resolveUserDestination(googleEmail);
      router.replace(nextRoute);
    } catch (err: unknown) {
      isAuthGuardPausedRef.current = false;
      const errCode =
        typeof err === "object" && err !== null && "code" in err
          ? String((err as { code: unknown }).code)
          : "";
      if (errCode === "auth/popup-closed-by-user") {
        setError("Google sign-up was cancelled.");
      } else if (errCode === "auth/account-exists-with-different-credential") {
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
