import React, { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/router";
import { FaChevronRight, FaSearch, FaUsers, FaAngleLeft, FaAngleRight } from "react-icons/fa";
import { Timestamp, collection, getDocs } from "firebase/firestore";
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
  lastScannedAt: string;
  scanCount: number;
};

const HACKERS_COLLECTION = "testHackers";
const ITEMS_PER_PAGE = 30;
const PAGE_WINDOW_SIZE = 6;

const toSafeString = (value: unknown): string => (typeof value === "string" ? value : "");

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
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [searchText, setSearchText] = useState("");
  const [checkedInFilter, setCheckedInFilter] = useState<"all" | "true" | "false">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "accepted" | "rejected">("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [hackers, setHackers] = useState<HackerRow[]>([]);

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
              hasLoggedIn: Boolean(data.hasLoggedin),
              isCheckedIn: getBooleanByKeys(data, ["isCheckedIn", "checkedIn"]),
              status: toSafeString(data.status).trim().toLowerCase(),
              lastScannedAt: formatDateValue(data.lastScannedAt),
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
    const query = searchText.trim().toLowerCase();
    return hackers.filter((hacker) => {
      const matchesSearch =
        !query ||
        [hacker.displayName, hacker.email, hacker.id].some((candidate) =>
          candidate.toLowerCase().includes(query)
        );

      const matchesCheckedIn =
        checkedInFilter === "all" ||
        (checkedInFilter === "true" ? hacker.isCheckedIn : !hacker.isCheckedIn);

      const matchesStatus =
        statusFilter === "all" || hacker.status === statusFilter;

      return matchesSearch && matchesCheckedIn && matchesStatus;
    });
  }, [checkedInFilter, hackers, searchText, statusFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [checkedInFilter, searchText, statusFilter]);

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
                <h1 className="text-3xl font-bold">Admin Hackers</h1>
              </div>
            </div>
            <button
              type="button"
              onClick={() => router.push("/scanner")}
              className="rounded-xl px-4 py-3 bg-[#2d0a4b] text-white font-semibold transition hover:bg-[#4b1c7a]"
            >
              Go to Scanner
            </button>
          </div>

          <div className="relative mb-5">
            <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
            <input
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search by name, email, or document id"
              className="w-full rounded-xl pl-10 pr-4 py-3 bg-black/35 border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-[#a259ff]"
            />
          </div>

          <div className="mb-5 grid grid-cols-1 md:grid-cols-2 gap-3">
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
                onChange={(e) => setStatusFilter(e.target.value as "all" | "accepted" | "rejected")}
                className="w-full rounded-xl px-4 py-3 bg-black/35 border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-[#a259ff]"
              >
                <option value="all" className="text-black">All</option>
                <option value="accepted" className="text-black">Accepted</option>
                <option value="rejected" className="text-black">Rejected</option>
              </select>
            </label>
          </div>

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
                            hacker.status === "accepted"
                              ? "text-green-300"
                              : hacker.status === "rejected"
                                ? "text-red-300"
                                : "text-gray-200"
                          }
                        >
                          {hacker.status || "unknown"}
                        </span>
                      </div>
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
