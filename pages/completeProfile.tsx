import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { auth, db } from "@/firebase/clientApp";
import { collection, doc, getDocs, limit, query, serverTimestamp, updateDoc, where } from "firebase/firestore";

const HACKERS_COLLECTION = "hackers";

type HackerMatch = {
  id: string;
  data: Record<string, unknown>;
};

const getPhoneFromData = (data: Record<string, unknown>): string => {
  const candidates = [data.phone_number, data.phoneNumber, data.phone];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return "";
};

const onlyDigits = (value: string): string => value.replace(/\D/g, "");

const formatPhoneDisplay = (digitsInput: string): string => {
  let digits = onlyDigits(digitsInput);
  if (digits.length > 11) digits = digits.slice(0, 11);
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  if (digits.length > 10) digits = digits.slice(0, 10);

  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
};

const normalizePhoneForStorage = (value: string): string | null => {
  let digits = onlyDigits(value);
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  if (digits.length !== 10) return null;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
};

const pickPrimaryMatch = (matches: HackerMatch[]): HackerMatch | null => {
  if (matches.length === 0) return null;
  return matches.find((item) => Boolean(item.data.hasLoggedIn) || Boolean(item.data.hasLoggedin)) ?? matches[0];
};

const CompleteProfile = () => {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState("");
  const [targetDocId, setTargetDocId] = useState("");
  const [firstNameInput, setFirstNameInput] = useState("");
  const [lastNameInput, setLastNameInput] = useState("");
  const [phoneInput, setPhoneInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const phonePreview = useMemo(() => formatPhoneDisplay(phoneInput), [phoneInput]);

  useEffect(() => {
    let active = true;

    const getMatchesByEmail = async (rawEmail: string): Promise<HackerMatch[]> => {
      const trimmed = rawEmail.trim();
      if (!trimmed) return [];
      const candidates = Array.from(new Set([trimmed, trimmed.toLowerCase()]));
      const seen = new Set<string>();
      const matches: HackerMatch[] = [];

      for (const candidate of candidates) {
        const snap = await getDocs(
          query(collection(db, HACKERS_COLLECTION), where("email", "==", candidate), limit(25))
        );
        for (const docSnap of snap.docs) {
          if (seen.has(docSnap.id)) continue;
          seen.add(docSnap.id);
          matches.push({ id: docSnap.id, data: docSnap.data() as Record<string, unknown> });
        }
      }

      return matches;
    };

    const unsubscribe = auth.onAuthStateChanged((user) => {
      const sync = async () => {
        if (!user) {
          if (active) {
            router.replace("/signin");
          }
          return;
        }

        const email = (user.email || "").trim().toLowerCase();
        if (active) {
          setUserEmail(email);
        }

        try {
          const matches = await getMatchesByEmail(email);
          const primary = pickPrimaryMatch(matches);
          if (!active) return;

          if (!primary) {
            setError("No application record found for this account.");
            setLoading(false);
            return;
          }

          const existingPhone = getPhoneFromData(primary.data);
          if (existingPhone) {
            router.replace("/userProfile");
            return;
          }

          setTargetDocId(primary.id);
          setLoading(false);
        } catch {
          if (active) {
            setError("Unable to load profile setup. Please try again.");
            setLoading(false);
          }
        }
      };

      void sync();
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [router]);

  const handleSave = async () => {
    setError("");
    if (!targetDocId) {
      setError("Unable to find your application record.");
      return;
    }

    const firstName = firstNameInput.trim();
    const lastName = lastNameInput.trim();
    if (!firstName || !lastName) {
      setError("Please enter your first and last name.");
      return;
    }

    const normalizedPhone = normalizePhoneForStorage(phoneInput);
    if (!normalizedPhone) {
      setError("Please enter a valid US phone number (10 digits).");
      return;
    }

    setSaving(true);
    try {
      await updateDoc(doc(db, HACKERS_COLLECTION, targetDocId), {
        fname: firstName,
        lname: lastName,
        phone_number: normalizedPhone,
        updatedAt: serverTimestamp(),
      });
      router.replace("/userProfile");
    } catch {
      setError("Unable to save your profile. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#1a0033] via-[#2d0a4b] to-[#0f051d] text-white">
        Loading profile setup...
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-gradient-to-br from-[#1a0033] via-[#2d0a4b] to-[#0f051d] text-white">
      <div className="w-full max-w-2xl rounded-3xl border border-white/20 bg-white/10 backdrop-blur-md p-6 md:p-8 shadow-2xl">
        <h1 className="text-3xl font-bold mb-3">Complete Your Profile</h1>
        <p className="text-gray-300 mb-6">
          Please fill in your details below to finish setting up your account.
        </p>

        {userEmail && (
          <div className="mb-6">
            <label className="block text-sm uppercase tracking-widest text-gray-200 mb-2">Email</label>
            <input
              type="email"
              value={userEmail}
              readOnly
              className="w-full rounded-xl px-4 py-3 bg-black/20 border border-white/10 text-gray-300 cursor-not-allowed"
            />
          </div>
        )}

        <div className="flex gap-4 mb-4">
          <div className="flex-1">
            <label className="block text-sm uppercase tracking-widest text-gray-200 mb-2">First Name</label>
            <input
              type="text"
              value={firstNameInput}
              onChange={(e) => setFirstNameInput(e.target.value)}
              placeholder="Jane"
              className="w-full rounded-xl px-4 py-3 bg-black/35 border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-[#a259ff]"
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm uppercase tracking-widest text-gray-200 mb-2">Last Name</label>
            <input
              type="text"
              value={lastNameInput}
              onChange={(e) => setLastNameInput(e.target.value)}
              placeholder="Doe"
              className="w-full rounded-xl px-4 py-3 bg-black/35 border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-[#a259ff]"
            />
          </div>
        </div>

        <label className="block text-sm uppercase tracking-widest text-gray-200 mb-2">Phone Number</label>
        <input
          type="tel"
          inputMode="tel"
          value={phonePreview}
          onChange={(e) => setPhoneInput(e.target.value)}
          placeholder="(123) 456-7890"
          className="w-full rounded-xl px-4 py-3 bg-black/35 border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-[#a259ff] mb-3"
        />
        <p className="text-xs text-gray-300 mb-6">Format: US 10-digit number.</p>

        {error && <div className="mb-4 text-sm text-red-300">{error}</div>}

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="w-full rounded-xl px-4 py-3 bg-[#2d0a4b] text-white font-semibold transition hover:bg-[#4b1c7a] disabled:opacity-70"
        >
          {saving ? "Saving..." : "Save and Continue"}
        </button>
      </div>
    </div>
  );
};

export default CompleteProfile;
