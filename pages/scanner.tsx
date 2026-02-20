import Head from "next/head";
import { useEffect, useRef, useState } from "react";
import type { GetServerSideProps } from "next";
import { useRouter } from "next/router";
import { signOut } from "firebase/auth";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db, auth } from "@/firebase/clientApp";
import { adminAuth } from "@/firebase/admin";
import {
  ADMIN_BYPASS_COOKIE_NAME,
  ADMIN_SESSION_COOKIE_NAME,
  isAllowedAdminEmail,
  normalizeAdminEmail,
  verifyAdminBypassToken,
} from "@/lib/adminAuth";

type ScanField = "check_in" | "lunch_1" | "lunch_2" | "breakfast" | "dinner";
type ScannerPageProps = { adminEmail: string };

const SCAN_OPTIONS: Array<{ label: string; value: ScanField }> = [
  { label: "Check In", value: "check_in" },
  { label: "Lunch 1", value: "lunch_1" },
  { label: "Lunch 2", value: "lunch_2" },
  { label: "Breakfast", value: "breakfast" },
  { label: "Dinner", value: "dinner" },
];

const PARTICIPANTS_COLLECTION = "participants";

type DetectedCode = { rawValue?: string };
type QrDetector = {
  detect: (source: HTMLVideoElement) => Promise<DetectedCode[]>;
};
type BarcodeDetectorCtor = new (options: { formats: string[] }) => QrDetector;

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  return "Unknown error";
};

const getParticipantIdFromQr = (raw: string): string | null => {
  const value = raw.trim();
  if (!value) return null;

  if (value.includes("/")) {
    const parts = value.split("/").filter(Boolean);
    if (parts.length >= 2 && parts[parts.length - 2] === PARTICIPANTS_COLLECTION) {
      return parts[parts.length - 1];
    }
  }

  try {
    const parsed = JSON.parse(value);
    if (typeof parsed?.participantId === "string") return parsed.participantId.trim();
    if (typeof parsed?.docId === "string") return parsed.docId.trim();
    if (typeof parsed?.id === "string") return parsed.id.trim();
  } catch {
    // Raw QR text fallback.
  }

  return value;
};

export default function ScannerPage({ adminEmail }: ScannerPageProps) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameTimerRef = useRef<number | null>(null);
  const isDetectingRef = useRef(false);
  const barcodeDetectorRef = useRef<QrDetector | null>(null);
  const lastScanRef = useRef<{ value: string; at: number } | null>(null);

  const [selectedField, setSelectedField] = useState<ScanField>("check_in");
  const [status, setStatus] = useState("Starting camera...");
  const [isReady, setIsReady] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const stopCamera = () => {
    if (frameTimerRef.current) {
      window.clearInterval(frameTimerRef.current);
      frameTimerRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const updateFirebase = async (participantId: string, qrRaw: string) => {
    const participantRef = doc(db, PARTICIPANTS_COLLECTION, participantId);

    await updateDoc(participantRef, {
      [selectedField]: true,
      [`${selectedField}_at`]: serverTimestamp(),
      last_scan_value: qrRaw,
      updated_at: serverTimestamp(),
    });

    setStatus(
      `Updated "${selectedField}" for participant "${participantId}" at ${new Date().toLocaleTimeString()}.`
    );
  };

  const onScan = async (rawValue: string) => {
    const now = Date.now();
    const last = lastScanRef.current;

    if (last && last.value === rawValue && now - last.at < 2500) {
      return;
    }
    lastScanRef.current = { value: rawValue, at: now };

    const participantId = getParticipantIdFromQr(rawValue);
    if (!participantId) {
      setStatus("QR scanned, but no participant ID was found.");
      return;
    }

    try {
      await updateFirebase(participantId, rawValue);
    } catch (error: unknown) {
      setStatus(`Scan worked, but Firebase update failed: ${getErrorMessage(error)}`);
    }
  };

  const handleSignOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);

    try {
      await fetch("/api/admin/session/end", { method: "POST" });
      await signOut(auth);
      router.push("/signin");
    } catch {
      setStatus("Could not sign out cleanly. Refresh and try again.");
      setIsSigningOut(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const start = async () => {
      const detectorCtor = (window as Window & { BarcodeDetector?: BarcodeDetectorCtor })
        .BarcodeDetector;
      if (!detectorCtor) {
        setStatus(
          "This browser does not support BarcodeDetector. Use latest Chrome/Edge on HTTPS."
        );
        return;
      }

      try {
        const detector = new detectorCtor({ formats: ["qr_code"] });
        barcodeDetectorRef.current = detector;

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;

        if (!videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();

        setIsReady(true);
        setStatus("Camera ready. Point it at a QR code.");

        frameTimerRef.current = window.setInterval(async () => {
          if (isDetectingRef.current || !videoRef.current || !barcodeDetectorRef.current) return;
          isDetectingRef.current = true;
          try {
            const codes = await barcodeDetectorRef.current.detect(videoRef.current);
            if (!codes?.length) return;

            const raw = codes[0]?.rawValue;
            if (typeof raw === "string" && raw.trim()) {
              await onScan(raw);
            }
          } catch {
            // Camera frame read can fail intermittently; keep scanning.
          } finally {
            isDetectingRef.current = false;
          }
        }, 350);
      } catch (error: unknown) {
        setStatus(`Unable to start camera: ${getErrorMessage(error)}`);
      }
    };

    start();

    return () => {
      cancelled = true;
      stopCamera();
    };
    // Intentionally stable; scanner should remain active while page is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <Head>
        <title>HackAI Scanner</title>
      </Head>

      <main className="min-h-screen bg-black text-white p-6">
        <div className="mx-auto max-w-2xl">
          <div className="mb-4 flex items-center justify-between gap-4">
            <p className="text-xs text-white/75">Admin: {adminEmail}</p>
            <button
              type="button"
              onClick={handleSignOut}
              disabled={isSigningOut}
              className="rounded-md border border-white/25 bg-white/10 px-3 py-1 text-xs hover:bg-white/20 disabled:opacity-60"
            >
              {isSigningOut ? "Signing out..." : "Sign out"}
            </button>
          </div>

          <h1 className="text-3xl font-bold mb-2">QR Scanner</h1>
          <p className="text-sm text-white/80 mb-6">
            Select an action, then scan a participant QR code. This updates the selected Firestore
            field in <code>{PARTICIPANTS_COLLECTION}</code>.
          </p>

          <label className="block mb-3 text-sm font-semibold" htmlFor="scan-action">
            Action
          </label>
          <select
            id="scan-action"
            value={selectedField}
            onChange={(event) => setSelectedField(event.target.value as ScanField)}
            className="w-full rounded-lg bg-zinc-900 border border-zinc-700 p-3 mb-6"
          >
            {SCAN_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <div className="rounded-xl overflow-hidden border border-zinc-700 bg-zinc-950 mb-4">
            <video ref={videoRef} className="w-full aspect-video object-cover" muted playsInline />
          </div>

          <div
            className={`rounded-lg border p-3 text-sm ${
              isReady ? "border-emerald-500/50 bg-emerald-950/30" : "border-zinc-700 bg-zinc-900"
            }`}
          >
            {status}
          </div>
        </div>
      </main>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<ScannerPageProps> = async (context) => {
  const bypassCookie = context.req.cookies[ADMIN_BYPASS_COOKIE_NAME];
  if (bypassCookie && verifyAdminBypassToken(bypassCookie)) {
    return {
      props: { adminEmail: "bypass@local" },
    };
  }

  const sessionCookie = context.req.cookies[ADMIN_SESSION_COOKIE_NAME];
  if (!sessionCookie) {
    return {
      redirect: { destination: "/signin", permanent: false },
    };
  }

  try {
    const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
    const adminEmail = normalizeAdminEmail(decoded.email || "");
    if (!adminEmail || !isAllowedAdminEmail(adminEmail)) {
      return {
        redirect: { destination: "/signin", permanent: false },
      };
    }

    return {
      props: { adminEmail },
    };
  } catch {
    return {
      redirect: { destination: "/signin", permanent: false },
    };
  }
};
