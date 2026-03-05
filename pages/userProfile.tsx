import React, { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import { auth, db } from "@/firebase/clientApp";
import { FaUserCircle } from "react-icons/fa";
import { QRCodeSVG } from "qrcode.react";
import type { User } from "firebase/auth";
import { useRouter } from "next/router";
import { collection, getDocs, limit, query, where } from "firebase/firestore";

const normalizeKey = (key: string): string => key.toLowerCase().replace(/[^a-z0-9]/g, "");

const getStringByKeys = (data: Record<string, unknown>, keys: string[]): string => {
  const normalizedEntries = new Map<string, unknown>();
  for (const [key, value] of Object.entries(data)) {
    normalizedEntries.set(normalizeKey(key), value);
  }

  for (const key of keys) {
    const value = normalizedEntries.get(normalizeKey(key));
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
};

const getNameFromDoc = (data: Record<string, unknown>): string => {
  const firstName = getStringByKeys(data, ["fname", "firstName", "first_name", "first name", "firstname"]);
  const lastName = getStringByKeys(data, ["lname", "lastName", "last_name", "last name", "lastname"]);
  const joined = `${firstName} ${lastName}`.trim();
  if (joined) return joined;

  return getStringByKeys(data, [
    "name",
    "fullName",
    "full_name",
    "displayName",
    "display_name",
    "applicantName",
    "preferredName",
    "legalName",
  ]);
};

const getStatusFromDoc = (data: Record<string, unknown>): string => {
  return getStringByKeys(data, ["status", "applicationStatus", "application_status", "decision"]);
};

const getPhoneFromDoc = (data: Record<string, unknown>): string => {
  return getStringByKeys(data, ["phone_number", "phoneNumber", "phone"]);
};

const formatStatusLabel = (rawStatus: string): string => {
  return rawStatus
    .trim()
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
};

const getStatusPillClass = (rawStatus: string): string => {
  const normalized = rawStatus.trim().toLowerCase();
  if (normalized === "accepted") return "border-green-500/60 bg-green-500/15 text-green-200";
  if (normalized === "rejected") return "border-red-500/60 bg-red-500/15 text-red-200";
  if (normalized === "waitlisted" || normalized === "waitlist") {
    return "border-yellow-500/60 bg-yellow-500/15 text-yellow-200";
  }
  return "border-white/30 bg-white/10 text-gray-100";
};

type ProfileInfo = {
  title: string;
  status: string;
  requiresPhone: boolean;
};

const getProfileInfo = async (email: string, fallbackDisplayName?: string | null): Promise<ProfileInfo> => {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    return {
      title: fallbackDisplayName?.trim() || "Your Profile",
      status: "",
      requiresPhone: false,
    };
  }

  const emailCandidates = Array.from(new Set([email.trim(), normalizedEmail]));
  const collectionsToCheck = ["hackers"];

  for (const collectionName of collectionsToCheck) {
    for (const emailCandidate of emailCandidates) {
      const snap = await getDocs(
        query(collection(db, collectionName), where("email", "==", emailCandidate), limit(1))
      );
      if (!snap.empty) {
        const data = snap.docs[0].data() as Record<string, unknown>;
        const name = getNameFromDoc(data);
        return {
          title: name || fallbackDisplayName?.trim() || "Your Profile",
          status: getStatusFromDoc(data),
          requiresPhone: !getPhoneFromDoc(data),
        };
      }
    }
  }

  return {
    title: fallbackDisplayName?.trim() || "Your Profile",
    status: "",
    requiresPhone: false,
  };
};

const UserProfile = () => {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [profileTitle, setProfileTitle] = useState("Your Profile");
  const [profileStatus, setProfileStatus] = useState("");

  useEffect(() => {
    let active = true;

    const syncProfile = async (user: User | null) => {
      const email = user?.email?.trim() || "";
      if (active) {
        setUserEmail(email || null);
      }

      if (!user) {
        if (active) {
          setProfileTitle("Your Profile");
          setProfileStatus("");
        }
        return;
      }

      try {
        const profileInfo = await getProfileInfo(email, user.displayName);
        if (profileInfo.requiresPhone) {
          router.replace("/completeProfile");
          return;
        }
        if (active) {
          setProfileTitle(profileInfo.title || "Your Profile");
          setProfileStatus(profileInfo.status || "");
        }
      } catch {
        if (active) {
          setProfileTitle(user.displayName?.trim() || "Your Profile");
          setProfileStatus("");
        }
      }
    };

    const unsubscribe = auth.onAuthStateChanged((user) => {
      void syncProfile(user);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [router]);

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-[#1a0033] via-[#2d0a4b] to-[#0f051d] text-white">
      <Navbar />
      <div className="flex flex-1 flex-col items-center justify-center py-10 px-4 sm:px-8">
        <div className="glass-card rounded-3xl shadow-2xl p-6 w-full max-w-2xl flex flex-col items-center relative z-10 mt-24">
          <FaUserCircle className="text-6xl text-[#a259ff] mb-2" />
          <h2 className="text-3xl font-bold mb-1 text-center">{profileTitle}</h2>
          {userEmail && (
            <div className="mb-4 text-gray-300 text-center text-base">{userEmail}</div>
          )}
          {profileStatus && (
            <div
              className={`mb-4 px-4 py-2 rounded-xl border text-sm font-semibold ${getStatusPillClass(profileStatus)}`}
            >
              Status: {formatStatusLabel(profileStatus)}
            </div>
          )}
          <div className="w-44 h-44 bg-gradient-to-br from-[#2d0a4b] to-[#a259ff] flex items-center justify-center rounded-2xl shadow-lg mb-6">
            {userEmail ? (
              <QRCodeSVG value={userEmail} size={160} bgColor="transparent" fgColor="#fff" level="H" />
            ) : (
              <div className="text-gray-400">Sign in to see your QR code</div>
            )}
          </div>
          <hr className="w-2/3 border-t border-gray-600 mb-6" />
          <p className="text-lg text-center mb-2">Welcome to HackAI 2026!</p>
          <p className="text-base text-gray-300 text-center">Show this QR code at check-in.<br />If you have questions, visit the help desk or contact us.</p>
        </div>
      </div>
    </div>
  );
};

export default UserProfile;
