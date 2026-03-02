import type { NextApiRequest, NextApiResponse } from "next";
import { adminAuth, adminDb } from "@/firebase/admin";

type AssignResponse =
  | { ok: true; totalCheckedIn: number; assignedB: number; message: string }
  | { ok: false; error: string; details?: string };

const normalizeString = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const getBearerToken = (req: NextApiRequest): string => {
  const authHeader = req.headers.authorization || "";
  const parts = authHeader.split(" ");
  if (parts.length === 2 && parts[0] === "Bearer") {
    return parts[1];
  }
  return "";
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<AssignResponse>
) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const token = getBearerToken(req);
    if (!token) {
      return res.status(401).json({ ok: false, error: "Missing auth token." });
    }

    const decoded = await adminAuth.verifyIdToken(token, true);
    const callerEmail = normalizeString(decoded.email).toLowerCase();
    const adminEmail = normalizeString(process.env.ADMIN_EMAIL).toLowerCase();
    if (!adminEmail) {
      return res.status(500).json({ ok: false, error: "ADMIN_EMAIL is not configured on the server." });
    }
    if (decoded.email_verified !== true) {
      return res.status(403).json({ ok: false, error: "Verified admin account required." });
    }
    if (!callerEmail || callerEmail !== adminEmail) {
      return res.status(403).json({ ok: false, error: "Admin access required." });
    }

    const hackersSnap = await adminDb.collection("hackers").get();
    const checkedInIds: string[] = [];

    for (const doc of hackersSnap.docs) {
      const data = doc.data();
      if (data.isCheckedIn === true || data.checkedIn === true) {
        checkedInIds.push(doc.id);
      }
    }

    if (checkedInIds.length === 0) {
      return res.status(200).json({
        ok: true,
        totalCheckedIn: 0,
        assignedB: 0,
        message: "No checked-in hackers found. Nothing to assign.",
      });
    }

    // Shuffle to randomize which half gets group B
    for (let i = checkedInIds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [checkedInIds[i], checkedInIds[j]] = [checkedInIds[j], checkedInIds[i]];
    }

    const halfCount = Math.floor(checkedInIds.length / 2);
    const groupAIds = checkedInIds.slice(0, checkedInIds.length - halfCount);
    const groupBIds = checkedInIds.slice(checkedInIds.length - halfCount);

    // Batch writes (Firestore limit: 500 per batch)
    const BATCH_SIZE = 450;

    for (let i = 0; i < groupAIds.length; i += BATCH_SIZE) {
      const batch = adminDb.batch();
      const chunk = groupAIds.slice(i, i + BATCH_SIZE);
      for (const id of chunk) {
        batch.update(adminDb.collection("hackers").doc(id), { foodGroup: "A" });
      }
      await batch.commit();
    }

    for (let i = 0; i < groupBIds.length; i += BATCH_SIZE) {
      const batch = adminDb.batch();
      const chunk = groupBIds.slice(i, i + BATCH_SIZE);
      for (const id of chunk) {
        batch.update(adminDb.collection("hackers").doc(id), { foodGroup: "B" });
      }
      await batch.commit();
    }

    return res.status(200).json({
      ok: true,
      totalCheckedIn: checkedInIds.length,
      assignedB: groupBIds.length,
      message: `Assigned food groups: ${groupAIds.length} → Group A, ${groupBIds.length} → Group B.`,
    });
  } catch (err: unknown) {
    const details = err instanceof Error ? err.message : "Unknown error";
    return res.status(500).json({
      ok: false,
      error: "Failed to assign food groups.",
      details,
    });
  }
}
