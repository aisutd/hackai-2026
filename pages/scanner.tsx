import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/router";
import { FaQrcode, FaHistory, FaCamera, FaStop } from "react-icons/fa";
import { auth, db } from "@/firebase/clientApp";
import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,

  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { isAdminEmail } from "@/utils/adminAccess";
import jsQR from "jsqr";

type ScanMode =
  | "check-in"
  | "saturday-lunch"
  | "sunday-lunch"
  | "dinner"
  | "breakfast"
  | "waitlist";

type ScanRecord = {
  id: string;
  mode: ScanMode;
  value: string;
  createdAt: string;
};

type ScanStatus = {
  tone: "success" | "error" | "info";
  text: string;
};

type PendingWaitlistAssignment = {
  hackerId: string;
  scannedValue: string;
  assignedNumber: number;
  email: string;
  displayName: string;
};

type ModeCounts = Record<ScanMode, number>;
type StandardScanMode = Exclude<ScanMode, "waitlist">;

type DetectedCode = { rawValue?: string };
type QRDetector = {
  detect: (source: HTMLCanvasElement) => Promise<DetectedCode[]>;
};
type QRDetectorConstructor = new (opts?: { formats?: string[] }) => QRDetector;

const SCAN_STORAGE_KEY = "hackai_scanner_records";
const HACKERS_COLLECTION = "hackers";
const SCANNER_STATS_COLLECTION = "scannerStats";
const SCANNER_STATS_DOC_ID = "global";
const QR_SCAN_COOLDOWN_MS = 10000;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const normalizeStatus = (value: unknown): "accepted" | "rejected" | "waitlist" | "" => {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  if (raw.startsWith("waitlist")) return "waitlist";
  if (raw === "accepted") return "accepted";
  if (raw === "rejected") return "rejected";
  return "";
};

const extractWaitlistNumber = (value: unknown): number => {
  const raw = String(value || "").trim();
  const match = raw.match(/waitlist\s*#\s*(\d+)/i);
  if (!match) return 0;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : 0;
};

const createEmptyCounts = (): ModeCounts => ({
  "check-in": 0,
  "saturday-lunch": 0,
  "sunday-lunch": 0,
  dinner: 0,
  breakfast: 0,
  waitlist: 0,
});

const MODE_STATS_FIELD: Record<ScanMode, string> = {
  "check-in": "checkIn",
  "saturday-lunch": "saturdayLunch",
  "sunday-lunch": "sundayLunch",
  dinner: "dinner",
  breakfast: "breakfast",
  waitlist: "waitlist",
};

const MODE_CONFIG: Record<StandardScanMode, { field: string; requiresCheckIn: boolean; aliases: string[] }> = {
  "check-in": { field: "isCheckedIn", requiresCheckIn: false, aliases: ["isCheckedIn"] },
  "saturday-lunch": { field: "lunchd1", requiresCheckIn: true, aliases: ["lunchd1", "lunch1"] },
  "sunday-lunch": { field: "lunchd2", requiresCheckIn: true, aliases: ["lunchd2", "lunch2"] },
  dinner: { field: "dinner", requiresCheckIn: true, aliases: ["dinner"] },
  breakfast: { field: "breakfast", requiresCheckIn: true, aliases: ["breakfast"] },
};

const SCAN_MODES: { value: ScanMode; label: string; help: string }[] = [
  { value: "check-in", label: "Check In", help: "Use for event check in." },
  { value: "saturday-lunch", label: "Saturday-Lunch", help: "Use for Saturday lunch distribution." },
  { value: "sunday-lunch", label: "Sunday-Lunch", help: "Use for Sunday lunch distribution." },
  { value: "dinner", label: "Dinner", help: "Use for dinner scans." },
  { value: "breakfast", label: "Breakfast", help: "Use for breakfast scans." },
  {
    value: "waitlist",
    label: "Waitlist",
    help: "Use to move rejected hackers to waitlist after scanning their QR.",
  },
];

function ScannerPage() {
  const router = useRouter();
  const [mode, setMode] = useState<ScanMode>("check-in");
  const [status, setStatus] = useState<ScanStatus | null>(null);
  const [scannerActive, setScannerActive] = useState(false);
  const [scannerError, setScannerError] = useState("");
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [statsCounts, setStatsCounts] = useState<ModeCounts>(createEmptyCounts);
  const [statsDocId, setStatsDocId] = useState("");
  const [pendingWaitlistAssignment, setPendingWaitlistAssignment] = useState<PendingWaitlistAssignment | null>(null);
  const [pendingWaitlistEmail, setPendingWaitlistEmail] = useState("");
  const [pendingWaitlistError, setPendingWaitlistError] = useState("");
  const [pendingWaitlistSaving, setPendingWaitlistSaving] = useState(false);
  const [records, setRecords] = useState<ScanRecord[]>(() => {
    if (typeof window === "undefined") return [];
    const raw = localStorage.getItem(SCAN_STORAGE_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as ScanRecord[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<QRDetector | null>(null);
  const loopTimerRef = useRef<number | null>(null);
  const lastScanRef = useRef<{ value: string; at: number }>({ value: "", at: 0 });
  const recentQrScansRef = useRef<Record<string, number>>({});
  const statusHoldUntilRef = useRef(0);
  const isDetectingRef = useRef(false);
  const hackerIdCacheRef = useRef<Record<string, string>>({});

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

    const loadStats = async () => {
      try {
        const statsListSnap = await getDocs(query(collection(db, SCANNER_STATS_COLLECTION), limit(1)));
        if (statsListSnap.empty) {
          if (!cancelled) {
            setStatsDocId(SCANNER_STATS_DOC_ID);
            setStatsCounts(createEmptyCounts());
          }
          return;
        }

        const statsDoc = statsListSnap.docs[0];
        const resolvedDocId = statsDoc.id;
        const data = statsDoc.data() as Record<string, unknown>;
        const loaded: ModeCounts = createEmptyCounts();
        for (const scanMode of SCAN_MODES) {
          const field = MODE_STATS_FIELD[scanMode.value];
          const raw = data[field];
          loaded[scanMode.value] = typeof raw === "number" ? raw : 0;
        }

        if (!cancelled) {
          setStatsDocId(resolvedDocId);
          setStatsCounts(loaded);
        }
      } catch {
        if (!cancelled) {
          setStatsCounts(createEmptyCounts());
        }
      }
    };

    void loadStats();

    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  useEffect(() => {
    localStorage.setItem(SCAN_STORAGE_KEY, JSON.stringify(records));
  }, [records]);

  const selectedMode = useMemo(
    () => SCAN_MODES.find((m) => m.value === mode) ?? SCAN_MODES[0],
    [mode]
  );

  const visibleStatModes = useMemo(
    () => SCAN_MODES.filter((item) => statsCounts[item.value] > 0),
    [statsCounts]
  );

  const ensureStatsDocId = useCallback(async (): Promise<string> => {
    if (statsDocId) return statsDocId;

    const statsListSnap = await getDocs(query(collection(db, SCANNER_STATS_COLLECTION), limit(1)));
    if (!statsListSnap.empty) {
      const existingId = statsListSnap.docs[0].id;
      setStatsDocId(existingId);
      return existingId;
    }

    setStatsDocId(SCANNER_STATS_DOC_ID);
    return SCANNER_STATS_DOC_ID;
  }, [statsDocId]);

  const resolveNextWaitlistNumber = useCallback(async (): Promise<number> => {
    const resolvedStatsDocId = await ensureStatsDocId();
    const statsSnap = await getDoc(doc(db, SCANNER_STATS_COLLECTION, resolvedStatsDocId));
    let currentCount = 0;
    if (statsSnap.exists()) {
      const data = statsSnap.data() as Record<string, unknown>;
      const raw = data[MODE_STATS_FIELD.waitlist];
      currentCount = typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
    }
    return currentCount + 1;
  }, [ensureStatsDocId]);

  const findHackerIdByQrValue = useCallback(async (rawValue: string): Promise<string | null> => {
    const trimmed = rawValue.trim();
    if (!trimmed) return null;

    const lower = trimmed.toLowerCase();
    if (hackerIdCacheRef.current[lower]) {
      return hackerIdCacheRef.current[lower];
    }

    const hackersRef = collection(db, HACKERS_COLLECTION);

    const lowerMatchSnap = await getDocs(
      query(hackersRef, where("email", "==", lower), limit(1))
    );
    if (!lowerMatchSnap.empty) {
      const hackerId = lowerMatchSnap.docs[0].id;
      hackerIdCacheRef.current[lower] = hackerId;
      return hackerId;
    }

    if (trimmed !== lower) {
      const exactMatchSnap = await getDocs(
        query(hackersRef, where("email", "==", trimmed), limit(1))
      );
      if (!exactMatchSnap.empty) {
        const hackerId = exactMatchSnap.docs[0].id;
        hackerIdCacheRef.current[lower] = hackerId;
        return hackerId;
      }
    }

    const idMatchSnap = await getDoc(doc(db, HACKERS_COLLECTION, trimmed));
    if (idMatchSnap.exists()) {
      hackerIdCacheRef.current[lower] = idMatchSnap.id;
      return idMatchSnap.id;
    }

    return null;
  }, []);

  const getBooleanByAliases = useCallback((data: Record<string, unknown>, aliases: string[]): boolean => {
    return aliases.some((alias) => Boolean(data[alias]));
  }, []);

  const setStatusWithHold = useCallback((next: ScanStatus, holdMs = 3000) => {
    setStatus(next);
    statusHoldUntilRef.current = Date.now() + holdMs;
  }, []);

  const handleScanAttempt = useCallback(async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      setStatusWithHold({ tone: "error", text: "Rejected: no QR value detected." });
      return;
    }

    try {
      const hackerId = await findHackerIdByQrValue(trimmed);
      if (!hackerId) {
        setStatusWithHold({
          tone: "error",
          text: `Rejected: no hacker found in ${HACKERS_COLLECTION} for "${trimmed}".`,
        });
        return;
      }

      const hackerRef = doc(db, HACKERS_COLLECTION, hackerId);
      const hackerSnap = await getDoc(hackerRef);
      if (!hackerSnap.exists()) {
        setStatusWithHold({ tone: "error", text: "Rejected: hacker record does not exist." });
        return;
      }

      const hackerData = hackerSnap.data() as Record<string, unknown>;
      const modeLabel = SCAN_MODES.find((item) => item.value === mode)?.label ?? mode;
      const currentStatus = normalizeStatus(hackerData.status);

      if (mode === "waitlist") {
        if (currentStatus === "waitlist") {
          setStatusWithHold({
            tone: "error",
            text: "Rejected: this hacker is already on waitlist.",
          });
          return;
        }

        if (currentStatus !== "rejected") {
          setStatusWithHold({
            tone: "error",
            text: "Rejected: only rejected hackers can be moved to waitlist.",
          });
          return;
        }

        const nextWaitlistNumber = await resolveNextWaitlistNumber();
        const firstName = String(
          hackerData.fname || hackerData.first_name || hackerData.firstName || ""
        ).trim();
        const lastName = String(
          hackerData.lname || hackerData.last_name || hackerData.lastName || ""
        ).trim();
        const displayName = `${firstName} ${lastName}`.trim() || trimmed;
        const email = String(hackerData.email || "").trim().toLowerCase();

        setPendingWaitlistAssignment({
          hackerId,
          scannedValue: trimmed,
          assignedNumber: nextWaitlistNumber,
          email,
          displayName,
        });
        setPendingWaitlistEmail(email);
        setPendingWaitlistError("");
        setStatusWithHold({
          tone: "info",
          text: `Review waitlist assignment for ${displayName} (#${nextWaitlistNumber}).`,
        }, 1000);
        return;
      }

      const modeConfig = MODE_CONFIG[mode];

      const isWaitlisted = currentStatus === "waitlist";

      if (currentStatus === "rejected") {
        setStatusWithHold({
          tone: "error",
          text: "Rejected: this hacker's status is rejected. Use Waitlist mode to process them.",
        });
        return;
      }

      if (mode === "check-in" && !isWaitlisted && currentStatus !== "accepted") {
        setStatusWithHold({
          tone: "error",
          text: `Rejected: only accepted or waitlisted hackers can be checked in (current status: ${String(hackerData.status || "unknown")}).`,
        });
        return;
      }

      if (mode !== "check-in" && currentStatus !== "accepted") {
        setStatusWithHold({
          tone: "error",
          text: `Rejected: only accepted hackers can be scanned for ${modeLabel} (current status: ${String(hackerData.status || "unknown")}).`,
        });
        return;
      }

      const hasLoggedIn = getBooleanByAliases(hackerData, ["hasLoggedin", "hasLoggedIn"]);
      if (!hasLoggedIn) {
        setStatusWithHold({
          tone: "error",
          text: `Rejected: hacker must be logged in before ${modeLabel}.`,
        });
        return;
      }

      const isCheckedIn = getBooleanByAliases(hackerData, ["isCheckedIn"]);
      if (modeConfig.requiresCheckIn && !isCheckedIn) {
        setStatusWithHold({
          tone: "error",
          text: `Rejected: hacker must be checked in before ${modeLabel}.`,
        });
        return;
      }

      const alreadyScannedForMode = getBooleanByAliases(hackerData, modeConfig.aliases);
      if (alreadyScannedForMode) {
        setStatusWithHold({
          tone: "error",
          text: "This hacker has already been scanned.",
        });
        return;
      }

      const now = new Date();
      const record: ScanRecord = {
        id: `${now.getTime()}-${Math.random().toString(16).slice(2, 8)}`,
        mode,
        value: trimmed,
        createdAt: now.toLocaleString(),
      };
      const scanEntry = {
        mode: record.mode,
        value: record.value,
        scannedAt: now.toISOString(),
        scannedAtEpoch: now.getTime(),
        createdAtLabel: record.createdAt,
        status: "approved",
      };

      const updates: Record<string, unknown> = {
        lastScannedAt: serverTimestamp(),
        scanCount: increment(1),
        [modeConfig.field]: true,
        scans: arrayUnion(scanEntry),
      };

      // If a waitlisted hacker is checking in, promote their status to accepted
      if (mode === "check-in" && isWaitlisted) {
        updates.status = "accepted";
        updates.updatedAt = serverTimestamp();
      }

      await updateDoc(hackerRef, updates);
      let statsUpdated = false;
      try {
        const resolvedStatsDocId = await ensureStatsDocId();
        await setDoc(
          doc(db, SCANNER_STATS_COLLECTION, resolvedStatsDocId),
          {
            [MODE_STATS_FIELD[mode]]: increment(1),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
        statsUpdated = true;
      } catch (statsErr) {
        console.error("Scanner stats update failed (non-blocking):", statsErr);
      }

      setRecords((prev) => [record, ...prev].slice(0, 100));
      if (statsUpdated) {
        setStatsCounts((prev) => ({
          ...prev,
          [mode]: prev[mode] + 1,
        }));
      }
      if (mode === "check-in") {
        const firstName = String(
          hackerData.fname || hackerData.first_name || hackerData.firstName || ""
        ).trim();
        const lastName = String(
          hackerData.lname || hackerData.last_name || hackerData.lastName || ""
        ).trim();
        const fullName = `${firstName} ${lastName}`.trim() || trimmed;
        setStatusWithHold({
          tone: "success",
          text: isWaitlisted
            ? `Approved: ${fullName} moved from waitlist to accepted and checked in.`
            : `Approved: ${fullName} is accepted and has been checked in.`,
        });
      } else {
        setStatusWithHold({
          tone: "success",
          text: `Approved: ${modeLabel} scan recorded for ${trimmed}.`,
        });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Scan processing failed.";
      setStatusWithHold({
        tone: "error",
        text: `Rejected: ${message}`,
      });
    }
  }, [ensureStatsDocId, findHackerIdByQrValue, getBooleanByAliases, mode, resolveNextWaitlistNumber, setStatusWithHold]);

  const confirmWaitlistAssignment = useCallback(async () => {
    if (!pendingWaitlistAssignment || pendingWaitlistSaving) return;

    const finalEmail = pendingWaitlistEmail.trim().toLowerCase();
    if (!EMAIL_RE.test(finalEmail)) {
      setPendingWaitlistError("Enter a valid email before confirming.");
      return;
    }

    setPendingWaitlistSaving(true);
    setPendingWaitlistError("");

    try {
      const now = new Date();
      const record: ScanRecord = {
        id: `${now.getTime()}-${Math.random().toString(16).slice(2, 8)}`,
        mode: "waitlist",
        value: pendingWaitlistAssignment.scannedValue,
        createdAt: now.toLocaleString(),
      };
      const scanEntry = {
        mode: record.mode,
        value: record.value,
        scannedAt: now.toISOString(),
        scannedAtEpoch: now.getTime(),
        createdAtLabel: record.createdAt,
        status: "approved",
      };

      await updateDoc(doc(db, HACKERS_COLLECTION, pendingWaitlistAssignment.hackerId), {
        email: finalEmail,
        status: `waitlist #${pendingWaitlistAssignment.assignedNumber}`,
        waitlistNumber: pendingWaitlistAssignment.assignedNumber,
        waitlistedAt: serverTimestamp(),
        lastScannedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        scanCount: increment(1),
        scans: arrayUnion(scanEntry),
      });

      let statsUpdated = false;
      try {
        const resolvedStatsDocId = await ensureStatsDocId();
        await setDoc(
          doc(db, SCANNER_STATS_COLLECTION, resolvedStatsDocId),
          {
            [MODE_STATS_FIELD.waitlist]: increment(1),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
        statsUpdated = true;
      } catch (statsErr) {
        console.error("Scanner stats update failed (non-blocking):", statsErr);
      }

      setRecords((prev) => [record, ...prev].slice(0, 100));
      if (statsUpdated) {
        setStatsCounts((prev) => ({
          ...prev,
          waitlist: prev.waitlist + 1,
        }));
      }

      setStatusWithHold({
        tone: "success",
        text: `Approved: ${pendingWaitlistAssignment.displayName} moved to waitlist #${pendingWaitlistAssignment.assignedNumber}.`,
      });
      setPendingWaitlistAssignment(null);
      setPendingWaitlistEmail("");
      setPendingWaitlistError("");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unable to assign waitlist number.";
      setPendingWaitlistError(message);
    } finally {
      setPendingWaitlistSaving(false);
    }
  }, [ensureStatsDocId, pendingWaitlistAssignment, pendingWaitlistEmail, pendingWaitlistSaving, setStatusWithHold]);

  const stopScanner = useCallback(() => {
    if (loopTimerRef.current) {
      window.clearTimeout(loopTimerRef.current);
      loopTimerRef.current = null;
    }
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setScannerActive(false);
  }, []);

  const tickDetect = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || !detectorRef.current) return;
    if (isDetectingRef.current) return;
    if (pendingWaitlistAssignment) {
      loopTimerRef.current = window.setTimeout(() => {
        void tickDetect();
      }, 220);
      return;
    }
    if (Date.now() < statusHoldUntilRef.current) {
      loopTimerRef.current = window.setTimeout(() => {
        void tickDetect();
      }, 120);
      return;
    }

    const video = videoRef.current;
    if (video.readyState < 2) {
      loopTimerRef.current = window.setTimeout(() => {
        void tickDetect();
      }, 220);
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = video.videoWidth || 720;
    canvas.height = video.videoHeight || 480;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    try {
      isDetectingRef.current = true;
      const codes = await detectorRef.current.detect(canvas);
      const rawValue = codes[0]?.rawValue?.trim();
      if (rawValue) {
        const nowMs = Date.now();
        const scanKey = `${mode}:${rawValue.toLowerCase()}`;
        const lastSeenAt = recentQrScansRef.current[scanKey] ?? 0;
        if (nowMs - lastSeenAt < QR_SCAN_COOLDOWN_MS) {
          setStatusWithHold({
            tone: "info",
            text: "Cooldown: same QR was just scanned. Wait a moment before re-scanning.",
          });
          return;
        }

        const isSameAsLast =
          rawValue === lastScanRef.current.value && nowMs - lastScanRef.current.at < 1500;
        if (!isSameAsLast) {
          lastScanRef.current = { value: rawValue, at: nowMs };
          recentQrScansRef.current[scanKey] = nowMs;
          for (const [key, at] of Object.entries(recentQrScansRef.current)) {
            if (nowMs - at > QR_SCAN_COOLDOWN_MS * 3) {
              delete recentQrScansRef.current[key];
            }
          }
          await handleScanAttempt(rawValue);
        } else {
          setStatusWithHold({
            tone: "info",
            text: "Cooldown: same QR was just scanned. Wait a moment before re-scanning.",
          });
        }
      }
    } catch {
      // detector can throw while camera frames are initializing
    } finally {
      isDetectingRef.current = false;
      loopTimerRef.current = window.setTimeout(() => {
        void tickDetect();
      }, 220);
    }
  }, [handleScanAttempt, pendingWaitlistAssignment, setStatusWithHold]);

  const startScanner = useCallback(async () => {
    setScannerError("");
    try {
      const Ctor = (window as unknown as { BarcodeDetector?: QRDetectorConstructor })
        .BarcodeDetector;

      if (Ctor) {
        detectorRef.current = new Ctor({ formats: ["qr_code"] });
      } else {
        // Fallback: wrap jsQR in the same interface as BarcodeDetector
        detectorRef.current = {
          detect: async (canvas: HTMLCanvasElement): Promise<DetectedCode[]> => {
            const ctx = canvas.getContext("2d");
            if (!ctx) return [];
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const result = jsQR(imageData.data, canvas.width, canvas.height);
            if (result?.data) {
              return [{ rawValue: result.data }];
            }
            return [];
          },
        };
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });

      streamRef.current = stream;
      if (!videoRef.current) return;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setScannerActive(true);
      setStatus({
        tone: "info",
        text: `Scanner started${!Ctor ? " (jsQR fallback)" : ""}. Point camera at a QR code.`,
      });
      void tickDetect();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unable to start camera.";
      setScannerError(message);
      setStatus({
        tone: "error",
        text: `Scan failed: ${message}`,
      });
      stopScanner();
    }
  }, [stopScanner, tickDetect]);

  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, [stopScanner]);

  if (isAdmin !== true) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#1a0033] via-[#2d0a4b] to-[#0f051d] text-white">
        Loading scanner...
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-[#1a0033] via-[#2d0a4b] to-[#0f051d] text-white">
      <div className="px-5 md:px-10 pt-6 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => router.push("/")}
          className="relative h-10 w-24 cursor-pointer"
          aria-label="Go to home"
        >
          <img
            src="/Home/hackAiLogoColor.webp"
            alt="HackAI"
            className="object-contain w-full h-full"
          />
        </button>
        <button
          type="button"
          onClick={() => router.push("/admin/hackers")}
          className="rounded-xl px-4 py-2 bg-[#2d0a4b] text-white font-semibold transition hover:bg-[#4b1c7a]"
        >
          Hackers
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-4 py-10">
        <div className="rounded-3xl shadow-2xl p-8 w-full max-w-3xl flex flex-col items-center relative z-10 border border-white/20 bg-white/10 backdrop-blur-md">
          <FaQrcode className="text-5xl text-[#DDD059] mb-2" />
          <h1 className="text-3xl font-bold mb-1 text-center">Admin Scanner</h1>
          <p className="text-gray-200 text-center mb-6">{selectedMode.help}</p>

          <div className="w-full mb-4">
            <label className="block mb-2 text-sm uppercase tracking-widest text-gray-200">
              Scanner Mode
            </label>
            <select
              value={mode}
              onChange={(e) => {
                const newMode = e.target.value as ScanMode;
                setMode(newMode);
                if (scannerActive) {
                  stopScanner();
                  setTimeout(() => void startScanner(), 300);
                }
              }}
              className="w-full rounded-xl px-4 py-3 bg-black/40 border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-[#a259ff]"
            >
              {SCAN_MODES.map((item) => (
                <option key={item.value} value={item.value} className="text-black">
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          {visibleStatModes.length > 0 && (
            <div className="w-full flex flex-wrap gap-3 mb-5">
              {visibleStatModes.map((item) => (
                <div
                  key={item.value}
                  className="flex-1 min-w-[140px] rounded-xl border border-white/20 bg-black/35 px-4 py-3"
                >
                  <div className="text-[11px] uppercase tracking-widest text-gray-200">{item.label}</div>
                  <div className="text-2xl font-bold text-[#DDD059]">{statsCounts[item.value]}</div>
                </div>
              ))}
            </div>
          )}

          <div className="w-full mb-4 rounded-xl border border-white/20 bg-black/35 p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="text-sm uppercase tracking-widest text-gray-200">QR Camera Scanner</div>
              {scannerActive ? (
                <button
                  type="button"
                  onClick={stopScanner}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#5b1a1a] hover:bg-[#7a2525] px-3 py-2 text-sm font-semibold"
                >
                  <FaStop />
                  Stop
                </button>
              ) : (
                <button
                  type="button"
                  onClick={startScanner}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#1a4f2a] hover:bg-[#22663a] px-3 py-2 text-sm font-semibold"
                >
                  <FaCamera />
                  Start Camera
                </button>
              )}
            </div>

            <div className="relative w-full overflow-hidden rounded-lg border border-white/15 bg-black">
              <video ref={videoRef} className="w-full max-h-[360px] object-cover" muted playsInline />
            </div>
            <canvas ref={canvasRef} className="hidden" />
            {scannerError && <p className="mt-2 text-sm text-red-300">{scannerError}</p>}
          </div>

          <div className="w-full mb-4 rounded-xl border border-white/20 bg-black/35 px-4 py-3">
            <div className="text-sm uppercase tracking-widest text-gray-200 mb-1">Scan Status</div>
            {status ? (
              <p
                className={`text-sm ${
                  status.tone === "success"
                    ? "text-green-300"
                    : status.tone === "error"
                      ? "text-red-300"
                      : "text-[#DDD059]"
                }`}
              >
                {status.text}
              </p>
            ) : (
              <p className="text-sm text-gray-300">
                No scan yet. Start the camera and scan a QR code.
              </p>
            )}
          </div>

          {pendingWaitlistAssignment && (
            <div className="w-full mb-4 rounded-xl border border-yellow-300/35 bg-yellow-900/20 px-4 py-4">
              <div className="text-sm uppercase tracking-widest text-yellow-200 mb-2">Waitlist Queue Assignment</div>
              <div className="text-sm text-white mb-2">
                {pendingWaitlistAssignment.displayName} will be assigned to waitlist #
                <span className="text-[#DDD059] font-semibold"> {pendingWaitlistAssignment.assignedNumber}</span>.
              </div>
              <label className="block text-xs uppercase tracking-widest text-gray-200 mb-1">Email</label>
              <input
                value={pendingWaitlistEmail}
                onChange={(e) => setPendingWaitlistEmail(e.target.value)}
                className="w-full rounded-xl px-4 py-3 bg-black/40 border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-[#a259ff]"
              />
              {pendingWaitlistError && <div className="mt-2 text-sm text-red-300">{pendingWaitlistError}</div>}
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={confirmWaitlistAssignment}
                  disabled={pendingWaitlistSaving}
                  className="rounded-lg px-4 py-2 bg-[#2d0a4b] text-white font-semibold transition hover:bg-[#4b1c7a] disabled:opacity-60"
                >
                  {pendingWaitlistSaving ? "Saving..." : "OK - Assign Waitlist"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPendingWaitlistAssignment(null);
                    setPendingWaitlistEmail("");
                    setPendingWaitlistError("");
                    setStatusWithHold({ tone: "info", text: "Waitlist assignment cancelled." }, 1200);
                  }}
                  disabled={pendingWaitlistSaving}
                  className="rounded-lg px-4 py-2 border border-white/20 bg-black/30 text-white transition hover:bg-white/10 disabled:opacity-60"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="w-full mt-7">
            <div className="flex items-center gap-2 mb-3 text-gray-200">
              <FaHistory />
              <span className="text-sm uppercase tracking-widest">Recent Scans</span>
            </div>
            <div className="max-h-64 overflow-y-auto rounded-xl border border-white/15 bg-black/30">
              {records.length === 0 ? (
                <div className="px-4 py-4 text-sm text-gray-300">No scans recorded yet.</div>
              ) : (
                records.map((record) => (
                  <div key={record.id} className="px-4 py-3 border-b border-white/10 last:border-b-0">
                    <div className="text-xs text-[#DDD059] uppercase tracking-widest">
                      {SCAN_MODES.find((m) => m.value === record.mode)?.label ?? record.mode}
                    </div>
                    <div className="text-sm text-white break-all">{record.value}</div>
                    <div className="text-xs text-gray-300">{record.createdAt}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default dynamic(() => Promise.resolve(ScannerPage), { ssr: false });
