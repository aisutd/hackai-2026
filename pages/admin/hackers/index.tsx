import React, { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/router";
import { FaChevronRight, FaSearch, FaUsers, FaAngleLeft, FaAngleRight } from "react-icons/fa";
import { Timestamp, collection, doc, getDoc, getDocs, serverTimestamp, setDoc } from "firebase/firestore";
import Navbar from "@/components/Navbar";
import { auth, db } from "@/firebase/clientApp";
import { isAdminEmail } from "@/utils/adminAccess";

type HackerRow = {
  id: string;
  displayName: string;
  email: string;
  hasLoggedIn: boolean;
  isCheckedIn: boolean;
  status: string;
  normalizedStatus: "accepted" | "rejected" | "waitlist" | "";
  waitlistNumber: number;
  lastScannedAt: string;
  waitlistedAt: string;
  waitlistedAtEpoch: number;
  scanCount: number;
};

const HACKERS_COLLECTION = "hackers";
const ITEMS_PER_PAGE = 30;
const PAGE_WINDOW_SIZE = 6;

type ManualStatus = "accepted" | "rejected" | "waitlist";
type AdminViewMode = "all" | "waitlistQueue";

type ManualProfileForm = {
  firstName: string;
  lastName: string;
  email: string;
  status: ManualStatus;
  foodGroup: string;
  phoneNumber: string;
};

const EMPTY_MANUAL_PROFILE: ManualProfileForm = {
  firstName: "",
  lastName: "",
  email: "",
  status: "accepted",
  foodGroup: "",
  phoneNumber: "",
};

const toSafeString = (value: unknown): string => (typeof value === "string" ? value : "");

const normalizeStatus = (value: unknown): "accepted" | "rejected" | "waitlist" | "" => {
  const raw = toSafeString(value).trim().toLowerCase();
  if (!raw) return "";
  if (raw.startsWith("waitlist")) return "waitlist";
  if (raw === "accepted") return "accepted";
  if (raw === "rejected") return "rejected";
  return "";
};

const extractWaitlistNumber = (value: unknown): number => {
  const raw = toSafeString(value).trim();
  const match = raw.match(/waitlist\s*#\s*(\d+)/i);
  if (!match) return 0;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeKey = (key: string): string => key.toLowerCase().replace(/[^a-z0-9]/g, "");

const getStringByKeys = (data: Record<string, unknown>, keys: string[]): string => {
  const normalized = new Map<string, unknown>();
  for (const [key, value] of Object.entries(data)) {
    normalized.set(normalizeKey(key), value);
  }

  for (const key of keys) {
    const value = normalized.get(normalizeKey(key));
    const asString = toSafeString(value).trim();
    if (asString) return asString;
  }

  return "";
};

const getBooleanByKeys = (data: Record<string, unknown>, keys: string[]): boolean => {
  const normalized = new Map<string, unknown>();
  for (const [key, value] of Object.entries(data)) {
    normalized.set(normalizeKey(key), value);
  }

  for (const key of keys) {
    const value = normalized.get(normalizeKey(key));
    if (typeof value === "boolean") return value;
  }

  return false;
};

const titleCase = (value: string): string =>
  value
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");

const inferNameFromEmail = (email: string): string => {
  const local = email.split("@")[0] ?? "";
  const cleaned = local.replace(/[._-]+/g, " ").replace(/\d+/g, " ").trim();
  if (!cleaned) return "";
  return titleCase(cleaned.replace(/\s+/g, " "));
};

const formatDateValue = (value: unknown): string => {
  if (!value) return "Not available";
  if (value instanceof Timestamp) return value.toDate().toLocaleString();
  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  ) {
    return ((value as { toDate: () => Date }).toDate()).toLocaleString();
  }
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toLocaleString();
  }
  return "Not available";
};

const dateToEpoch = (value: unknown): number => {
  if (!value) return 0;
  if (value instanceof Timestamp) return value.toDate().getTime();
  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  ) {
    return ((value as { toDate: () => Date }).toDate()).getTime();
  }
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
};

const getDisplayName = (id: string, data: Record<string, unknown>): string => {
  const firstName = getStringByKeys(data, ["firstName", "first_name", "first name", "fname"]);
  const lastName = getStringByKeys(data, ["lastName", "last_name", "last name", "lname"]);
  const fullName = `${firstName} ${lastName}`.trim();
  if (fullName) return fullName;

  const name = getStringByKeys(data, [
    "name",
    "fullName",
    "full_name",
    "displayName",
    "display_name",
    "applicantName",
    "legalName",
    "preferredName",
    "hackerName",
  ]);
  if (name) return name;

  const email = getStringByKeys(data, ["email", "gmail"]);
  if (email) {
    const inferred = inferNameFromEmail(email);
    if (inferred) return inferred;
    return email;
  }

  return id;
};

function AdminHackersPage() {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [viewMode, setViewMode] = useState<AdminViewMode>("all");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [searchText, setSearchText] = useState("");
  const [loggedInFilter, setLoggedInFilter] = useState<"all" | "true" | "false">("all");
  const [checkedInFilter, setCheckedInFilter] = useState<"all" | "true" | "false">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "accepted" | "rejected" | "waitlist">("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [hackers, setHackers] = useState<HackerRow[]>([]);
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [manualProfile, setManualProfile] = useState<ManualProfileForm>(EMPTY_MANUAL_PROFILE);
  const [manualSaving, setManualSaving] = useState(false);
  const [manualError, setManualError] = useState("");
  const [manualSuccess, setManualSuccess] = useState("");
  const [lastCreatedProfileId, setLastCreatedProfileId] = useState("");
  const [waitlistRangeStart, setWaitlistRangeStart] = useState("");
  const [waitlistRangeEnd, setWaitlistRangeEnd] = useState("");
  const [sendingWaitlistRange, setSendingWaitlistRange] = useState(false);
  const [waitlistRangeError, setWaitlistRangeError] = useState("");
  const [waitlistRangeSuccess, setWaitlistRangeSuccess] = useState("");

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setIsAdmin(isAdminEmail(user?.email));
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (isAdmin === false) {
      router.replace("/signin");
    }
  }, [isAdmin, router]);

  useEffect(() => {
    if (isAdmin !== true) return;

    let cancelled = false;

    const loadHackers = async () => {
      setLoading(true);
      setLoadError("");
      try {
        const snap = await getDocs(collection(db, HACKERS_COLLECTION));
        if (cancelled) return;

        const rows = snap.docs
          .map((docSnap) => {
            const data = docSnap.data() as Record<string, unknown>;
            const status = toSafeString(data.status).trim();
            const normalizedStatus = normalizeStatus(status);
            const waitlistNumber =
              typeof data.waitlistNumber === "number" && Number.isFinite(data.waitlistNumber)
                ? data.waitlistNumber
                : extractWaitlistNumber(status);
            const scanCount =
              typeof data.scanCount === "number"
                ? data.scanCount
                : Array.isArray(data.scans)
                  ? data.scans.length
                  : 0;
              return {
                id: docSnap.id,
                displayName: getDisplayName(docSnap.id, data),
                email: toSafeString(data.email),
                hasLoggedIn: Boolean(data.hasLoggedIn) || Boolean(data.hasLoggedin),
                isCheckedIn: getBooleanByKeys(data, ["isCheckedIn", "checkedIn"]),
                status,
                normalizedStatus,
                waitlistNumber,
                lastScannedAt: formatDateValue(data.lastScannedAt),
              waitlistedAt: formatDateValue(data.waitlistedAt),
              waitlistedAtEpoch: dateToEpoch(data.waitlistedAt),
              scanCount,
            };
          })
          .sort((a, b) => a.displayName.localeCompare(b.displayName));

        setHackers(rows);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unable to load hackers.";
        setLoadError(message);
      } finally {
        setLoading(false);
      }
    };

    void loadHackers();

    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  const filteredHackers = useMemo(() => {
    const sourceRows =
      viewMode === "waitlistQueue"
        ? hackers.filter((hacker) => hacker.normalizedStatus === "waitlist")
        : hackers;
    const query = searchText.trim().toLowerCase();
    const filtered = sourceRows.filter((hacker) => {
      const matchesSearch =
        !query ||
        [hacker.displayName, hacker.email, hacker.id].some((candidate) =>
          candidate.toLowerCase().includes(query)
        );

      if (viewMode === "waitlistQueue") {
        return matchesSearch;
      }

      const matchesCheckedIn =
        checkedInFilter === "all" ||
        (checkedInFilter === "true" ? hacker.isCheckedIn : !hacker.isCheckedIn);

      const matchesLoggedIn =
        loggedInFilter === "all" ||
        (loggedInFilter === "true" ? hacker.hasLoggedIn : !hacker.hasLoggedIn);

      const matchesStatus =
        statusFilter === "all" || hacker.normalizedStatus === statusFilter;

      return matchesSearch && matchesCheckedIn && matchesLoggedIn && matchesStatus;
    });

    if (viewMode === "waitlistQueue" || statusFilter === "waitlist") {
      return [...filtered].sort((a, b) => {
        if (a.waitlistNumber && b.waitlistNumber && a.waitlistNumber !== b.waitlistNumber) {
          return a.waitlistNumber - b.waitlistNumber;
        }
        if (a.waitlistNumber && !b.waitlistNumber) return -1;
        if (!a.waitlistNumber && b.waitlistNumber) return 1;
        if (a.waitlistedAtEpoch !== b.waitlistedAtEpoch) {
          return a.waitlistedAtEpoch - b.waitlistedAtEpoch;
        }
        return a.displayName.localeCompare(b.displayName);
      });
    }

    return filtered;
  }, [checkedInFilter, hackers, loggedInFilter, searchText, statusFilter, viewMode]);

  const waitlistOrderById = useMemo(() => {
    const map = new Map<string, number>();
    if (viewMode !== "waitlistQueue" && statusFilter !== "waitlist") return map;
    filteredHackers.forEach((hacker, idx) => {
      map.set(hacker.id, idx + 1);
    });
    return map;
  }, [filteredHackers, statusFilter, viewMode]);

  useEffect(() => {
    setCurrentPage(1);
  }, [checkedInFilter, loggedInFilter, searchText, statusFilter, viewMode]);

  const totalPages = useMemo(() => {
    const pages = Math.ceil(filteredHackers.length / ITEMS_PER_PAGE);
    return pages > 0 ? pages : 1;
  }, [filteredHackers.length]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const paginatedHackers = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredHackers.slice(start, start + ITEMS_PER_PAGE);
  }, [currentPage, filteredHackers]);

  const pageWindowStart = useMemo(
    () => Math.floor((currentPage - 1) / PAGE_WINDOW_SIZE) * PAGE_WINDOW_SIZE + 1,
    [currentPage]
  );

  const pageNumbers = useMemo(() => {
    const end = Math.min(totalPages, pageWindowStart + PAGE_WINDOW_SIZE - 1);
    return Array.from({ length: end - pageWindowStart + 1 }, (_, idx) => pageWindowStart + idx);
  }, [pageWindowStart, totalPages]);

  const pageWindowEnd = pageNumbers[pageNumbers.length - 1] ?? pageWindowStart;
  const hasPrevWindow = pageWindowStart > 1;
  const hasNextWindow = pageWindowEnd < totalPages;
  const showingStart = filteredHackers.length === 0 ? 0 : (currentPage - 1) * ITEMS_PER_PAGE + 1;
  const showingEnd = Math.min(filteredHackers.length, currentPage * ITEMS_PER_PAGE);
  const canShowPagination = !loading && !loadError && filteredHackers.length > 0;

  const setManualField = <K extends keyof ManualProfileForm,>(key: K, value: ManualProfileForm[K]) => {
    setManualProfile((prev) => ({ ...prev, [key]: value }));
  };

  const generateUniqueAccessCode = async (): Promise<string> => {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const existing = await getDoc(doc(db, HACKERS_COLLECTION, code));
      if (!existing.exists()) {
        return code;
      }
    }
    throw new Error("Unable to generate a unique 6-digit access code. Try again.");
  };

  const handleAddProfile = async () => {
    const firstName = manualProfile.firstName.trim();
    const lastName = manualProfile.lastName.trim();
    const email = manualProfile.email.trim().toLowerCase();
    const foodGroup = manualProfile.foodGroup.trim();
    const phoneNumber = manualProfile.phoneNumber.trim();

    setManualError("");
    setManualSuccess("");
    setLastCreatedProfileId("");

    if (!firstName || !lastName) {
      setManualError("First name and last name are required.");
      return;
    }
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setManualError("Please enter a valid email.");
      return;
    }
    if (hackers.some((row) => row.email.trim().toLowerCase() === email)) {
      setManualError("A profile with this email already exists.");
      return;
    }

    setManualSaving(true);
    try {
      const accessCode = await generateUniqueAccessCode();
      const nextWaitlistNumber =
        manualProfile.status === "waitlist"
          ? hackers.reduce((max, row) => Math.max(max, row.waitlistNumber || 0), 0) + 1
          : 0;
      const resolvedStatus =
        manualProfile.status === "waitlist" ? `waitlist #${nextWaitlistNumber}` : manualProfile.status;
      const payload: Record<string, unknown> = {
        access_code: accessCode,
        email,
        fname: firstName,
        lname: lastName,
        status: resolvedStatus,
        foodGroup: foodGroup || "",
        hasLoggedIn: false,
        isCheckedIn: false,
        breakfast: false,
        dinner: false,
        lunchd1: false,
        lunchd2: false,
        scanCount: 0,
        scans: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      if (phoneNumber) {
        payload.phone_number = phoneNumber;
      }
      if (manualProfile.status === "waitlist") {
        payload.waitlistedAt = serverTimestamp();
        payload.waitlistNumber = nextWaitlistNumber;
      }

      await setDoc(doc(db, HACKERS_COLLECTION, accessCode), payload);

      const nextRow: HackerRow = {
        id: accessCode,
        displayName: `${firstName} ${lastName}`.trim() || accessCode,
        email,
        hasLoggedIn: false,
        isCheckedIn: false,
        status: resolvedStatus,
        normalizedStatus: normalizeStatus(resolvedStatus),
        waitlistNumber: nextWaitlistNumber,
        lastScannedAt: "Not available",
        waitlistedAt: manualProfile.status === "waitlist" ? new Date().toLocaleString() : "Not available",
        waitlistedAtEpoch: manualProfile.status === "waitlist" ? Date.now() : 0,
        scanCount: 0,
      };

      setHackers((prev) => [...prev, nextRow].sort((a, b) => a.displayName.localeCompare(b.displayName)));
      setManualSuccess(
        `Profile added for ${firstName} ${lastName}. Access code: ${accessCode}`
      );
      setLastCreatedProfileId(accessCode);
      setManualProfile(EMPTY_MANUAL_PROFILE);
      setCurrentPage(1);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unable to add profile.";
      setManualError(message);
    } finally {
      setManualSaving(false);
    }
  };

  const handleSendWaitlistRangeEmails = async () => {
    setWaitlistRangeError("");
    setWaitlistRangeSuccess("");

    const start = Number(waitlistRangeStart);
    const end = Number(waitlistRangeEnd);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start <= 0 || end <= 0) {
      setWaitlistRangeError("Enter valid positive start and end queue numbers.");
      return;
    }
    if (start > end) {
      setWaitlistRangeError("Start number must be less than or equal to end number.");
      return;
    }

    setSendingWaitlistRange(true);
    try {
      const user = auth.currentUser;
      if (!user) {
        throw new Error("Please sign in again, then retry.");
      }
      const token = await user.getIdToken();
      const response = await fetch("/api/admin/sendWaitlistQueueEmail", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ startNumber: start, endNumber: end }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        sent?: number;
        skipped?: number;
        failed?: number;
      };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Unable to send waitlist queue emails.");
      }

      setWaitlistRangeSuccess(
        `Waitlist range email complete. Sent: ${payload.sent ?? 0}, Skipped: ${payload.skipped ?? 0}, Failed: ${payload.failed ?? 0}.`
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unable to send waitlist queue emails.";
      setWaitlistRangeError(message);
    } finally {
      setSendingWaitlistRange(false);
    }
  };

  const renderPagination = (wrapperClassName: string) => (
    <div className={wrapperClassName}>
      <div className="text-sm text-gray-300">
        Showing {showingStart}-{showingEnd} of {filteredHackers.length}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => {
            if (!hasPrevWindow) return;
            setCurrentPage(Math.max(1, pageWindowStart - PAGE_WINDOW_SIZE));
          }}
          disabled={!hasPrevWindow}
          className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-white/20 bg-black/35 text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/10"
          aria-label="Previous page set"
        >
          <FaAngleLeft />
        </button>

        {pageNumbers.map((pageNum) => (
          <button
            key={pageNum}
            type="button"
            onClick={() => setCurrentPage(pageNum)}
            className={`h-9 min-w-9 px-3 inline-flex items-center justify-center rounded-lg border transition ${
              pageNum === currentPage
                ? "border-[#DDD059] bg-[#DDD059] text-black font-semibold"
                : "border-white/20 bg-black/35 text-white hover:bg-white/10"
            }`}
          >
            {pageNum}
          </button>
        ))}

        <button
          type="button"
          onClick={() => {
            if (!hasNextWindow) return;
            setCurrentPage(Math.min(totalPages, pageWindowStart + PAGE_WINDOW_SIZE));
          }}
          disabled={!hasNextWindow}
          className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-white/20 bg-black/35 text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/10"
          aria-label="Next page set"
        >
          <FaAngleRight />
        </button>

        <button
          type="button"
          onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
          disabled={currentPage >= totalPages}
          className="rounded-lg px-3 py-2 border border-white/20 bg-black/35 text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/10"
        >
          Next
        </button>
      </div>
    </div>
  );

  if (isAdmin !== true) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#1a0033] via-[#2d0a4b] to-[#0f051d] text-white">
        Loading admin hackers...
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-[#1a0033] via-[#2d0a4b] to-[#0f051d] text-white">
      <Navbar />
      <div style={{ height: "110px" }} />

      <div className="flex flex-1 px-4 py-8 md:px-8">
        <div className="w-full max-w-5xl mx-auto rounded-3xl border border-white/20 bg-white/10 backdrop-blur-md p-6 md:p-8 shadow-2xl">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <FaUsers className="text-[#DDD059]" />
                <h1 className="text-3xl font-bold">
                  {viewMode === "waitlistQueue" ? "Waitlist Queue" : "Admin Hackers"}
                </h1>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setViewMode((prev) => (prev === "waitlistQueue" ? "all" : "waitlistQueue"))}
                className="rounded-xl px-4 py-3 bg-[#4a226c] text-white font-semibold transition hover:bg-[#6a37a1]"
              >
                {viewMode === "waitlistQueue" ? "Back to All Hackers" : "Waitlist Queue"}
              </button>
              <button
                type="button"
                onClick={() => setShowManualAdd((prev) => !prev)}
                className="rounded-xl px-4 py-3 bg-[#3a1b56] text-white font-semibold transition hover:bg-[#5a2d84]"
                disabled={viewMode === "waitlistQueue"}
              >
                {showManualAdd ? "Hide Manual Add" : "Manual Add Profile"}
              </button>
              <button
                type="button"
                onClick={() => router.push("/scanner")}
                className="rounded-xl px-4 py-3 bg-[#2d0a4b] text-white font-semibold transition hover:bg-[#4b1c7a]"
              >
                Go to Scanner
              </button>
            </div>
          </div>

          {viewMode === "all" && showManualAdd && (
            <div className="mb-5 rounded-2xl border border-white/20 bg-black/30 p-4 md:p-5">
              <h2 className="text-lg font-semibold mb-3">Add Manual Hacker Profile</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="block">
                  <div className="text-xs uppercase tracking-widest text-gray-300 mb-1">First Name</div>
                  <input
                    value={manualProfile.firstName}
                    onChange={(e) => setManualField("firstName", e.target.value)}
                    className="w-full rounded-xl px-4 py-3 bg-black/35 border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-[#a259ff]"
                  />
                </label>
                <label className="block">
                  <div className="text-xs uppercase tracking-widest text-gray-300 mb-1">Last Name</div>
                  <input
                    value={manualProfile.lastName}
                    onChange={(e) => setManualField("lastName", e.target.value)}
                    className="w-full rounded-xl px-4 py-3 bg-black/35 border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-[#a259ff]"
                  />
                </label>
                <label className="block md:col-span-2">
                  <div className="text-xs uppercase tracking-widest text-gray-300 mb-1">Email</div>
                  <input
                    value={manualProfile.email}
                    onChange={(e) => setManualField("email", e.target.value)}
                    className="w-full rounded-xl px-4 py-3 bg-black/35 border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-[#a259ff]"
                  />
                </label>
                <label className="block">
                  <div className="text-xs uppercase tracking-widest text-gray-300 mb-1">Status</div>
                  <select
                    value={manualProfile.status}
                    onChange={(e) => setManualField("status", e.target.value as ManualStatus)}
                    className="w-full rounded-xl px-4 py-3 bg-black/35 border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-[#a259ff]"
                  >
                    <option value="accepted" className="text-black">Accepted</option>
                    <option value="rejected" className="text-black">Rejected</option>
                    <option value="waitlist" className="text-black">Waitlist</option>
                  </select>
                </label>
                <label className="block">
                  <div className="text-xs uppercase tracking-widest text-gray-300 mb-1">Food Group</div>
                  <input
                    value={manualProfile.foodGroup}
                    onChange={(e) => setManualField("foodGroup", e.target.value)}
                    className="w-full rounded-xl px-4 py-3 bg-black/35 border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-[#a259ff]"
                  />
                </label>
                <label className="block md:col-span-2">
                  <div className="text-xs uppercase tracking-widest text-gray-300 mb-1">Phone Number (Optional)</div>
                  <input
                    value={manualProfile.phoneNumber}
                    onChange={(e) => setManualField("phoneNumber", e.target.value)}
                    className="w-full rounded-xl px-4 py-3 bg-black/35 border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-[#a259ff]"
                  />
                </label>
              </div>

              {manualError && <div className="mt-3 text-sm text-red-300">{manualError}</div>}
              {manualSuccess && <div className="mt-3 text-sm text-green-300">{manualSuccess}</div>}

              <div className="mt-4 flex justify-end gap-2">
                {lastCreatedProfileId && (
                  <button
                    type="button"
                    onClick={() => router.push(`/admin/hackers/${encodeURIComponent(lastCreatedProfileId)}`)}
                    className="rounded-xl px-5 py-3 bg-black/40 border border-white/25 text-white font-semibold transition hover:bg-white/10"
                  >
                    Open New Profile
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleAddProfile}
                  disabled={manualSaving}
                  className="rounded-xl px-5 py-3 bg-[#2d0a4b] text-white font-semibold transition hover:bg-[#4b1c7a] disabled:opacity-60"
                >
                  {manualSaving ? "Adding..." : "Add Profile"}
                </button>
              </div>
            </div>
          )}

          <div className="relative mb-5">
            <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
            <input
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder={
                viewMode === "waitlistQueue"
                  ? "Search queue by name, email, or document id"
                  : "Search by name, email, or document id"
              }
              className="w-full rounded-xl pl-10 pr-4 py-3 bg-black/35 border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-[#a259ff]"
            />
          </div>

          {viewMode === "waitlistQueue" && (
            <div className="mb-5 rounded-2xl border border-white/20 bg-black/30 p-4 md:p-5">
              <h2 className="text-lg font-semibold mb-3">Send Waitlist Acceptance By Queue Range</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <label className="block">
                  <div className="text-xs uppercase tracking-widest text-gray-300 mb-1">Start #</div>
                  <input
                    value={waitlistRangeStart}
                    onChange={(e) => setWaitlistRangeStart(e.target.value.replace(/[^\d]/g, ""))}
                    className="w-full rounded-xl px-4 py-3 bg-black/35 border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-[#a259ff]"
                    inputMode="numeric"
                  />
                </label>
                <label className="block">
                  <div className="text-xs uppercase tracking-widest text-gray-300 mb-1">End #</div>
                  <input
                    value={waitlistRangeEnd}
                    onChange={(e) => setWaitlistRangeEnd(e.target.value.replace(/[^\d]/g, ""))}
                    className="w-full rounded-xl px-4 py-3 bg-black/35 border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-[#a259ff]"
                    inputMode="numeric"
                  />
                </label>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={handleSendWaitlistRangeEmails}
                    disabled={sendingWaitlistRange}
                    className="w-full rounded-xl px-4 py-3 bg-[#2d0a4b] text-white font-semibold transition hover:bg-[#4b1c7a] disabled:opacity-60"
                  >
                    {sendingWaitlistRange ? "Sending..." : "Send Range Email"}
                  </button>
                </div>
              </div>
              {waitlistRangeError && <div className="mt-3 text-sm text-red-300">{waitlistRangeError}</div>}
              {waitlistRangeSuccess && <div className="mt-3 text-sm text-green-300">{waitlistRangeSuccess}</div>}
            </div>
          )}

          {viewMode === "all" && (
          <div className="mb-5 grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="block">
              <div className="text-xs uppercase tracking-widest text-gray-300 mb-1">Has Logged In</div>
              <select
                value={loggedInFilter}
                onChange={(e) => setLoggedInFilter(e.target.value as "all" | "true" | "false")}
                className="w-full rounded-xl px-4 py-3 bg-black/35 border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-[#a259ff]"
              >
                <option value="all" className="text-black">All</option>
                <option value="true" className="text-black">True</option>
                <option value="false" className="text-black">False</option>
              </select>
            </label>

            <label className="block">
              <div className="text-xs uppercase tracking-widest text-gray-300 mb-1">Checked In</div>
              <select
                value={checkedInFilter}
                onChange={(e) => setCheckedInFilter(e.target.value as "all" | "true" | "false")}
                className="w-full rounded-xl px-4 py-3 bg-black/35 border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-[#a259ff]"
              >
                <option value="all" className="text-black">All</option>
                <option value="true" className="text-black">True</option>
                <option value="false" className="text-black">False</option>
              </select>
            </label>

            <label className="block">
              <div className="text-xs uppercase tracking-widest text-gray-300 mb-1">Status</div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as "all" | "accepted" | "rejected" | "waitlist")}
                className="w-full rounded-xl px-4 py-3 bg-black/35 border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-[#a259ff]"
              >
                <option value="all" className="text-black">All</option>
                <option value="accepted" className="text-black">Accepted</option>
                <option value="rejected" className="text-black">Rejected</option>
                <option value="waitlist" className="text-black">Waitlist</option>
              </select>
            </label>
          </div>
          )}

          {canShowPagination && renderPagination("mb-5 flex flex-col md:flex-row md:items-center md:justify-between gap-3")}

          <div className="rounded-2xl border border-white/15 bg-black/25 overflow-hidden">
            {loading && <div className="px-4 py-5 text-sm text-gray-300">Loading hackers...</div>}
            {!loading && loadError && <div className="px-4 py-5 text-sm text-red-300">{loadError}</div>}
            {!loading && !loadError && filteredHackers.length === 0 && (
              <div className="px-4 py-5 text-sm text-gray-300">No hackers matched your search.</div>
            )}
            {!loading &&
              !loadError &&
              paginatedHackers.map((hacker) => (
                <button
                  key={hacker.id}
                  type="button"
                  onClick={() => router.push(`/admin/hackers/${encodeURIComponent(hacker.id)}`)}
                  className="w-full text-left px-4 py-4 border-b border-white/10 last:border-b-0 hover:bg-white/5 transition"
                >
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div>
                      <div className="font-semibold text-lg text-white">{hacker.displayName}</div>
                      <div className="text-sm text-gray-200 break-all">
                        {hacker.email || "No email on file"}
                      </div>
                      <div className="text-xs text-gray-400 break-all">Doc ID: {hacker.id}</div>
                    </div>
                    <div className="flex items-center gap-3 md:gap-5">
                      <div className="text-xs text-gray-300 uppercase tracking-widest">
                        Logged In:{" "}
                        <span className={hacker.hasLoggedIn ? "text-green-300" : "text-red-300"}>
                          {hacker.hasLoggedIn ? "Yes" : "No"}
                        </span>
                      </div>
                      <div className="text-xs text-gray-300 uppercase tracking-widest">
                        Checked In:{" "}
                        <span className={hacker.isCheckedIn ? "text-green-300" : "text-red-300"}>
                          {hacker.isCheckedIn ? "True" : "False"}
                        </span>
                      </div>
                      <div className="text-xs text-gray-300 uppercase tracking-widest">
                        Status:{" "}
                        <span
                          className={
                            hacker.normalizedStatus === "accepted"
                              ? "text-green-300"
                              : hacker.normalizedStatus === "rejected"
                                ? "text-red-300"
                                : hacker.normalizedStatus === "waitlist"
                                  ? "text-yellow-300"
                                : "text-gray-200"
                          }
                        >
                          {hacker.status || hacker.normalizedStatus || "unknown"}
                        </span>
                      </div>
                      {(viewMode === "waitlistQueue" || statusFilter === "waitlist") && (
                        <div className="text-xs text-gray-300 uppercase tracking-widest">
                          Queue #:{" "}
                          <span className="text-[#DDD059]">{waitlistOrderById.get(hacker.id) ?? "-"}</span>
                        </div>
                      )}
                      {(viewMode === "waitlistQueue" || statusFilter === "waitlist") && (
                        <div className="text-xs text-gray-300 uppercase tracking-widest">
                          Waitlist #:{" "}
                          <span className="text-[#DDD059]">{hacker.waitlistNumber || "-"}</span>
                        </div>
                      )}
                      {(viewMode === "waitlistQueue" || statusFilter === "waitlist") && (
                        <div className="text-xs text-gray-300 hidden lg:block">
                          Waitlisted At: <span className="text-gray-100">{hacker.waitlistedAt}</span>
                        </div>
                      )}
                      <div className="text-xs text-gray-300 uppercase tracking-widest">
                        Scans: <span className="text-[#DDD059]">{hacker.scanCount}</span>
                      </div>
                      <div className="text-xs text-gray-300 hidden lg:block">
                        Last Scan: <span className="text-gray-100">{hacker.lastScannedAt}</span>
                      </div>
                      <FaChevronRight className="text-[#DDD059]" />
                    </div>
                  </div>
                </button>
              ))}
          </div>

          {canShowPagination && renderPagination("mt-5 flex flex-col md:flex-row md:items-center md:justify-between gap-3")}
        </div>
      </div>
    </div>
  );
}

export default dynamic(() => Promise.resolve(AdminHackersPage), { ssr: false });
