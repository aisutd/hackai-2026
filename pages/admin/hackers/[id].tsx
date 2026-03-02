import React, { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/router";
import { FaArrowLeft, FaHistory, FaQrcode, FaSave, FaUserCircle, FaEnvelope } from "react-icons/fa";
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import Navbar from "@/components/Navbar";
import { auth, db } from "@/firebase/clientApp";
import { isAdminEmail } from "@/utils/adminAccess";

type EditableType = "string" | "number" | "boolean" | "null";

type EditableField = {
  key: string;
  type: EditableType;
  value: string | boolean;
};

type HackerScan = {
  id: string;
  mode: string;
  value: string;
  timeLabel: string;
  sortAt: number;
};

const HACKERS_COLLECTION = "hackers";
const NON_EDITABLE_FIELDS = new Set(["scans", "createdAt", "updatedAt", "lastScannedAt"]);

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

const FIELD_LABELS: Record<string, string> = {
  lunch1: "Saturday Lunch",
  lunch2: "Sunday Lunch",
  lunchd1: "Saturday Lunch",
  lunchd2: "Sunday Lunch",
};

const normalizeLabel = (key: string): string => {
  const mapped = FIELD_LABELS[normalizeKey(key)];
  if (mapped) return mapped;

  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
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

const formatDateValue = (value: unknown): string => {
  const epoch = dateToEpoch(value);
  if (!epoch) return "Not available";
  return new Date(epoch).toLocaleString();
};

const getDisplayName = (id: string, data: Record<string, unknown> | null): string => {
  if (!data) return id;
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

const toEditableFields = (data: Record<string, unknown>): EditableField[] => {
  const fields: EditableField[] = [];

  for (const [key, value] of Object.entries(data)) {
    if (NON_EDITABLE_FIELDS.has(key)) continue;

    if (typeof value === "boolean") {
      fields.push({ key, type: "boolean", value });
      continue;
    }

    if (typeof value === "number") {
      fields.push({ key, type: "number", value: String(value) });
      continue;
    }

    if (typeof value === "string") {
      fields.push({ key, type: "string", value });
      continue;
    }

    if (value === null) {
      fields.push({ key, type: "null", value: "" });
    }
  }

  return fields.sort((a, b) => a.key.localeCompare(b.key));
};

const formatValuePreview = (value: unknown): string => {
  if (value === null) return "null";
  if (typeof value === "string") return value || "Empty";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Timestamp) return value.toDate().toLocaleString();
  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  ) {
    return ((value as { toDate: () => Date }).toDate()).toLocaleString();
  }
  try {
    const asJson = JSON.stringify(value);
    return asJson.length > 240 ? `${asJson.slice(0, 240)}...` : asJson;
  } catch {
    return "Unsupported value";
  }
};

function HackerAdminDetailPage() {
  const router = useRouter();
  const rawId = router.query.id;
  const hackerId = typeof rawId === "string" ? rawId : "";

  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailActionError, setEmailActionError] = useState("");
  const [emailActionSuccess, setEmailActionSuccess] = useState("");
  const [hackerData, setHackerData] = useState<Record<string, unknown> | null>(null);
  const [editableFields, setEditableFields] = useState<EditableField[]>([]);
  const [scanRows, setScanRows] = useState<HackerScan[]>([]);

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
    if (isAdmin !== true || !hackerId) return;

    let cancelled = false;

    const loadHacker = async () => {
      setLoading(true);
      setError("");
      setSaveMessage("");
      setEmailActionError("");
      setEmailActionSuccess("");
      setIsEditing(false);
      try {
        const hackerRef = doc(db, HACKERS_COLLECTION, hackerId);
        const hackerSnap = await getDoc(hackerRef);

        if (!hackerSnap.exists()) {
          if (!cancelled) {
            setError("Hacker not found.");
            setHackerData(null);
            setEditableFields([]);
            setScanRows([]);
          }
          return;
        }

        const data = hackerSnap.data() as Record<string, unknown>;

        const scanDocs = await getDocs(
          query(collection(db, HACKERS_COLLECTION, hackerId, "scans"), orderBy("scannedAt", "desc"), limit(250))
        );
        const subcollectionScans: HackerScan[] = scanDocs.docs.map((scanDoc) => {
          const scanData = scanDoc.data() as Record<string, unknown>;
          const scanTime = scanData.scannedAt ?? scanData.createdAt ?? scanData.createdAtLabel;
          return {
            id: scanDoc.id,
            mode: toSafeString(scanData.mode) || "unknown",
            value: toSafeString(scanData.value) || "No value",
            timeLabel: formatDateValue(scanTime),
            sortAt: dateToEpoch(scanTime),
          };
        });

        const embeddedScans: HackerScan[] = Array.isArray(data.scans)
          ? data.scans
              .map((item, idx) => {
                if (typeof item !== "object" || item === null) return null;
                const scanItem = item as Record<string, unknown>;
                const scanTime = scanItem.scannedAt ?? scanItem.createdAt ?? scanItem.createdAtLabel;
                return {
                  id: `embedded-${idx}`,
                  mode: toSafeString(scanItem.mode) || "unknown",
                  value: toSafeString(scanItem.value) || "No value",
                  timeLabel: formatDateValue(scanTime),
                  sortAt: dateToEpoch(scanTime),
                };
              })
              .filter((item): item is HackerScan => item !== null)
          : [];

        const mergedScans = [...subcollectionScans, ...embeddedScans].sort((a, b) => b.sortAt - a.sortAt);

        if (cancelled) return;
        setHackerData(data);
        setEditableFields(toEditableFields(data));
        setScanRows(mergedScans);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unable to load hacker.";
        if (!cancelled) {
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadHacker();

    return () => {
      cancelled = true;
    };
  }, [isAdmin, hackerId]);

  const readOnlyEntries = useMemo(() => {
    if (!hackerData) return [];
    return Object.entries(hackerData)
      .filter(([key, value]) => {
        if (NON_EDITABLE_FIELDS.has(key)) return true;
        return !(typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null);
      })
      .map(([key, value]) => ({ key, value: formatValuePreview(value) }))
      .sort((a, b) => a.key.localeCompare(b.key));
  }, [hackerData]);

  const email = useMemo(() => toSafeString(hackerData?.email).trim(), [hackerData]);
  const qrPayload = email || hackerId;
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(qrPayload)}`;

  const sendProfileEmail = async () => {
    if (!hackerId || !email) return;

    setEmailActionError("");
    setEmailActionSuccess("");
    setSendingEmail(true);

    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error("Please sign in again, then retry.");
      }

      const token = await currentUser.getIdToken();
      const response = await fetch("/api/admin/sendHackerEmail", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ hackerId }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Unable to send email.");
      }

      setEmailActionSuccess(`Email sent to ${email}.`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unable to send email.";
      setEmailActionError(message);
    } finally {
      setSendingEmail(false);
    }
  };

  const updateField = (fieldKey: string, nextValue: string | boolean) => {
    if (!isEditing) return;
    setEditableFields((prev) =>
      prev.map((field) => (field.key === fieldKey ? { ...field, value: nextValue } : field))
    );
  };

  const startEditing = () => {
    setError("");
    setSaveMessage("");
    setIsEditing(true);
  };

  const cancelEditing = () => {
    if (hackerData) {
      setEditableFields(toEditableFields(hackerData));
    }
    setError("");
    setSaveMessage("");
    setIsEditing(false);
  };

  const saveProfile = async () => {
    if (!hackerId || !isEditing) return;

    setSaving(true);
    setError("");
    setSaveMessage("");

    try {
      const updates: Record<string, unknown> = {};
      for (const field of editableFields) {
        if (field.type === "boolean") {
          updates[field.key] = Boolean(field.value);
          continue;
        }

        if (field.type === "number") {
          const raw = String(field.value).trim();
          if (!raw) {
            throw new Error(`"${field.key}" must be a number and cannot be empty.`);
          }
          const parsed = Number(raw);
          if (Number.isNaN(parsed)) {
            throw new Error(`"${field.key}" must be a valid number.`);
          }
          updates[field.key] = parsed;
          continue;
        }

        updates[field.key] = String(field.value);
      }

      await updateDoc(doc(db, HACKERS_COLLECTION, hackerId), {
        ...updates,
        updatedAt: serverTimestamp(),
      });

      setHackerData((prev) => (prev ? { ...prev, ...updates } : prev));
      setSaveMessage("Changes saved to Firebase.");
      setIsEditing(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unable to save changes.";
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const deleteProfile = async () => {
    if (!hackerId || !isEditing || saving || deleting) return;
    const confirmed = window.confirm(
      "Delete this hacker profile from Firebase? This action cannot be undone."
    );
    if (!confirmed) return;

    setDeleting(true);
    setError("");
    setSaveMessage("");

    try {
      while (true) {
        const scansSnap = await getDocs(
          query(collection(db, HACKERS_COLLECTION, hackerId, "scans"), limit(400))
        );
        if (scansSnap.empty) break;
        const batch = writeBatch(db);
        scansSnap.docs.forEach((scanDoc) => {
          batch.delete(scanDoc.ref);
        });
        await batch.commit();
      }

      await deleteDoc(doc(db, HACKERS_COLLECTION, hackerId));
      router.replace("/admin/hackers");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unable to delete profile.";
      setError(message);
      setDeleting(false);
    }
  };

  if (isAdmin !== true) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#1a0033] via-[#2d0a4b] to-[#0f051d] text-white">
        Loading hacker profile...
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-[#1a0033] via-[#2d0a4b] to-[#0f051d] text-white">
      <Navbar />
      <div style={{ height: "110px" }} />

      <div className="flex flex-1 px-4 py-8 md:px-8">
        <div className="w-full max-w-6xl mx-auto">
          <button
            type="button"
            onClick={() => router.push("/admin/hackers")}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2 mb-4 bg-black/35 border border-white/20 hover:bg-black/50 transition"
          >
            <FaArrowLeft />
            Back to Hackers
          </button>

          <div className="rounded-3xl border border-white/20 bg-white/10 backdrop-blur-md p-6 md:p-8 shadow-2xl">
            {loading && <div className="text-sm text-gray-300">Loading hacker details...</div>}
            {!loading && error && <div className="text-sm text-red-300 mb-4">{error}</div>}

            {!loading && hackerData && (
              <>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="rounded-2xl border border-white/15 bg-black/30 p-5">
                    <div className="flex items-center gap-3 mb-3">
                      <FaUserCircle className="text-2xl text-[#a259ff]" />
                      <div>
                        <h1 className="text-2xl font-bold">{getDisplayName(hackerId, hackerData)}</h1>
                        <div className="text-sm text-gray-300 break-all">{email || "No email found"}</div>
                        {email && (
                          <button
                            type="button"
                            onClick={sendProfileEmail}
                            disabled={sendingEmail}
                            className="mt-2 inline-flex items-center gap-2 rounded-lg px-3 py-2 border border-white/20 bg-black/35 text-white hover:bg-white/10 text-sm"
                          >
                            <FaEnvelope />
                            {sendingEmail ? "Sending..." : "Send Email"}
                          </button>
                        )}
                        {emailActionSuccess && (
                          <div className="mt-2 text-xs text-green-300">{emailActionSuccess}</div>
                        )}
                        {emailActionError && (
                          <div className="mt-2 text-xs text-red-300">{emailActionError}</div>
                        )}
                      </div>
                    </div>
                    <div className="text-xs text-gray-400 break-all mb-4">Doc ID: {hackerId}</div>

                    <div className="rounded-xl border border-white/15 bg-black/35 p-4 flex flex-col items-center">
                      <FaQrcode className="text-[#DDD059] mb-2" />
                      <img
                        src={qrSrc}
                        alt="Hacker QR code"
                        className="w-52 h-52 rounded-lg border border-white/20 bg-white p-1"
                      />
                      <div className="mt-2 text-xs text-gray-300 text-center break-all">
                        QR payload: {qrPayload || "Unavailable"}
                      </div>
                    </div>

                    <div className="mt-4 text-xs text-gray-300">
                      Last Scanned:{" "}
                      <span className="text-gray-100">{formatDateValue(hackerData.lastScannedAt)}</span>
                    </div>
                  </div>

                  <div className="lg:col-span-2 rounded-2xl border border-white/15 bg-black/30 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                      <h2 className="text-xl font-semibold">Editable Information</h2>
                      <div className="flex flex-wrap items-center gap-2">
                        {!isEditing ? (
                          <button
                            type="button"
                            onClick={startEditing}
                            disabled={saving || deleting}
                            className="inline-flex items-center gap-2 rounded-xl px-4 py-2 bg-[#2d0a4b] text-white font-semibold transition hover:bg-[#4b1c7a]"
                          >
                            Edit
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={cancelEditing}
                              disabled={saving || deleting}
                              className="rounded-xl px-4 py-2 border border-white/20 bg-black/35 text-white font-semibold transition hover:bg-white/10 disabled:opacity-70"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={deleteProfile}
                              disabled={saving || deleting}
                              className="rounded-xl px-4 py-2 bg-red-700/90 text-white font-semibold transition hover:bg-red-600 disabled:opacity-70"
                            >
                              {deleting ? "Deleting..." : "Delete Profile"}
                            </button>
                            <button
                              type="button"
                              onClick={saveProfile}
                              disabled={saving || deleting}
                              className="inline-flex items-center gap-2 rounded-xl px-4 py-2 bg-[#2d0a4b] text-white font-semibold transition hover:bg-[#4b1c7a] disabled:opacity-70"
                            >
                              <FaSave />
                              {saving ? "Saving..." : "Save Changes"}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    {editableFields.length === 0 && (
                      <div className="text-sm text-gray-300">No scalar fields available to edit.</div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {editableFields.map((field) => {
                        const boolValue = field.type === "boolean" ? Boolean(field.value) : false;
                        const isCheckInField = normalizeKey(field.key) === "ischeckedin";
                        const boolLabel = isCheckInField
                          ? boolValue
                            ? "Checked In"
                            : "Not Checked In"
                          : boolValue
                            ? "Enabled"
                            : "Not Enabled";

                        return (
                          <label key={field.key} className="block">
                            <div className="text-xs text-gray-300 uppercase tracking-widest mb-1">
                              {normalizeLabel(field.key)}
                            </div>
                            {field.type === "boolean" ? (
                              <div
                                className={`rounded-xl border px-4 py-3 ${
                                  boolValue
                                    ? "border-green-500/60 bg-green-500/10"
                                    : "border-red-500/60 bg-red-500/10"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={boolValue}
                                  onChange={(e) => updateField(field.key, e.target.checked)}
                                  disabled={!isEditing}
                                  className="h-4 w-4"
                                  style={{ accentColor: boolValue ? "#22c55e" : "#ef4444" }}
                                />
                                <span
                                  className={`ml-2 text-sm font-semibold ${
                                    boolValue ? "text-green-300" : "text-red-300"
                                  }`}
                                >
                                  {boolLabel}
                                </span>
                              </div>
                            ) : (
                              <input
                                value={String(field.value)}
                                onChange={(e) => updateField(field.key, e.target.value)}
                                readOnly={!isEditing}
                                className={`w-full rounded-xl px-4 py-3 border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-[#a259ff] ${
                                  isEditing ? "bg-black/35" : "bg-black/20 text-gray-200"
                                }`}
                              />
                            )}
                          </label>
                        );
                      })}
                    </div>
                    {saveMessage && <div className="text-sm text-green-300 mt-4">{saveMessage}</div>}
                  </div>
                </div>

                {readOnlyEntries.length > 0 && (
                  <div className="mt-6 rounded-2xl border border-white/15 bg-black/30 p-5">
                    <h2 className="text-xl font-semibold mb-3">Additional Read-only Data</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {readOnlyEntries.map((entry) => (
                        <div key={entry.key} className="rounded-xl border border-white/15 bg-black/35 p-3">
                          <div className="text-xs text-gray-300 uppercase tracking-widest mb-1">
                            {normalizeLabel(entry.key)}
                          </div>
                          <div className="text-sm text-gray-100 break-words">{entry.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-6 rounded-2xl border border-white/15 bg-black/30 p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <FaHistory className="text-[#DDD059]" />
                    <h2 className="text-xl font-semibold">Scan History</h2>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/35 overflow-hidden max-h-80 overflow-y-auto">
                    {scanRows.length === 0 ? (
                      <div className="px-4 py-4 text-sm text-gray-300">No scans found for this hacker yet.</div>
                    ) : (
                      scanRows.map((scan) => (
                        <div key={scan.id} className="px-4 py-3 border-b border-white/10 last:border-b-0">
                          <div className="text-xs text-[#DDD059] uppercase tracking-widest">{scan.mode}</div>
                          <div className="text-sm text-white break-all">{scan.value}</div>
                          <div className="text-xs text-gray-300">{scan.timeLabel}</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default dynamic(() => Promise.resolve(HackerAdminDetailPage), { ssr: false });
