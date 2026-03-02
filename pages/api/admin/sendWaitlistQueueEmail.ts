import type { NextApiRequest, NextApiResponse } from "next";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/firebase/admin";

type WaitlistRangeResponse =
  | { ok: true; sent: number; skipped: number; failed: number; failures: string[] }
  | { ok: false; error: string };

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const normalizeString = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const normalizeStatus = (value: unknown): "accepted" | "rejected" | "waitlist" | "" => {
  const raw = normalizeString(value).toLowerCase();
  if (!raw) return "";
  if (raw.startsWith("waitlist")) return "waitlist";
  if (raw === "accepted") return "accepted";
  if (raw === "rejected") return "rejected";
  return "";
};

const extractWaitlistNumber = (status: string): number => {
  const match = status.match(/waitlist\s*#\s*(\d+)/i);
  if (!match) return 0;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getWaitlistNumber = (data: Record<string, unknown>): number => {
  if (typeof data.waitlistNumber === "number" && Number.isFinite(data.waitlistNumber)) {
    return data.waitlistNumber;
  }
  return extractWaitlistNumber(normalizeString(data.status));
};

const getFirstName = (data: Record<string, unknown>): string =>
  normalizeString(data.fname) ||
  normalizeString(data.first_name) ||
  normalizeString(data.firstName) ||
  "Hacker";

const getBearerToken = (req: NextApiRequest): string => {
  const authHeader = req.headers.authorization || "";
  const parts = authHeader.split(" ");
  return parts.length === 2 && parts[0] === "Bearer" ? parts[1] : "";
};

const buildWaitlistAcceptedEmail = (firstName: string, queueNumber: number) => {
  const subject = "HackAI 2026 Waitlist Update";
  const text = `Hi ${firstName},

Great news. Your waitlist has been accepted for HackAI 2026.

Queue number: ${queueNumber}

Please come to check-in as soon as possible and bring a valid ID.

Thanks,
Artificial Intelligence Society`;

  const html = `
  <html>
    <body>
      <p>Hi ${firstName},</p>
      <p><strong>Great news.</strong> Your waitlist has been accepted for HackAI 2026.</p>
      <p><strong>Queue number:</strong> ${queueNumber}</p>
      <p>Please come to check-in as soon as possible and bring a valid ID.</p>
      <p>Thanks,<br />Artificial Intelligence Society</p>
    </body>
  </html>
  `;

  return { subject, text, html };
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WaitlistRangeResponse>
) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed." });
  }

  try {
    // Lazy load for environments where nodemailer may not be installed yet.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const nodemailer = require("nodemailer") as {
      createTransport: (cfg: Record<string, unknown>) => {
        sendMail: (msg: Record<string, unknown>) => Promise<void>;
      };
    };

    const token = getBearerToken(req);
    if (!token) {
      return res.status(401).json({ ok: false, error: "Missing auth token." });
    }

    const decoded = await adminAuth.verifyIdToken(token, true);
    const callerEmail = normalizeString(decoded.email).toLowerCase();
    const adminEmail = normalizeString(process.env.NEXT_PUBLIC_ADMIN_EMAIL).toLowerCase();
    if (!adminEmail) {
      return res.status(500).json({ ok: false, error: "ADMIN_EMAIL is not configured." });
    }
    if (decoded.email_verified !== true || callerEmail !== adminEmail) {
      return res.status(403).json({ ok: false, error: "Admin access required." });
    }

    const startNumber = Number(req.body?.startNumber);
    const endNumber = Number(req.body?.endNumber);
    if (
      !Number.isInteger(startNumber) ||
      !Number.isInteger(endNumber) ||
      startNumber <= 0 ||
      endNumber <= 0 ||
      startNumber > endNumber
    ) {
      return res.status(400).json({ ok: false, error: "Invalid waitlist range." });
    }

    const smtpEmail = normalizeString(process.env.SMTP_EMAIL);
    const smtpPassword = normalizeString(process.env.SMTP_APP_PASSWORD);
    if (!smtpEmail || !smtpPassword) {
      return res.status(500).json({
        ok: false,
        error: "SMTP_EMAIL and SMTP_APP_PASSWORD must be configured.",
      });
    }

    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: smtpEmail, pass: smtpPassword },
    });

    const allHackers = await adminDb.collection("hackers").get();
    const waitlistRows = allHackers.docs
      .map((snap) => {
        const data = (snap.data() || {}) as Record<string, unknown>;
        const status = normalizeStatus(data.status);
        const waitlistNumber = getWaitlistNumber(data);
        return {
          docId: snap.id,
          data,
          status,
          waitlistNumber,
        };
      })
      .filter(
        (row) =>
          row.status === "waitlist" &&
          row.waitlistNumber >= startNumber &&
          row.waitlistNumber <= endNumber
      )
      .sort((a, b) => a.waitlistNumber - b.waitlistNumber);

    let sent = 0;
    let skipped = 0;
    let failed = 0;
    const failures: string[] = [];
    const sentEmails = new Set<string>();

    for (const row of waitlistRows) {
      const email = normalizeString(row.data.email).toLowerCase();
      if (!email || !EMAIL_RE.test(email)) {
        skipped += 1;
        failures.push(`${row.docId}: invalid email`);
        continue;
      }
      if (sentEmails.has(email)) {
        skipped += 1;
        failures.push(`${row.docId}: duplicate email ${email}`);
        continue;
      }
      sentEmails.add(email);

      const firstName = getFirstName(row.data);
      const { subject, text, html } = buildWaitlistAcceptedEmail(firstName, row.waitlistNumber);

      try {
        await transporter.sendMail({
          from: smtpEmail,
          to: email,
          subject,
          text,
          html,
        });
        sent += 1;
        await adminDb.collection("hackers").doc(row.docId).update({
          waitlistAcceptedEmailSentAt: FieldValue.serverTimestamp(),
          waitlistAcceptedEmailSentTo: email,
          waitlistAcceptedEmailSentBy: callerEmail,
          waitlistAcceptedEmailRange: `${startNumber}-${endNumber}`,
          waitlistAcceptedEmailStatus: "sent",
          waitlistAcceptedEmailError: FieldValue.delete(),
        });
      } catch (err: unknown) {
        failed += 1;
        const reason = err instanceof Error ? err.message : "Unknown email error";
        failures.push(`${row.docId}: ${reason}`);
        await adminDb.collection("hackers").doc(row.docId).update({
          waitlistAcceptedEmailStatus: "failed",
          waitlistAcceptedEmailError: reason,
        });
      }
    }

    return res.status(200).json({
      ok: true,
      sent,
      skipped,
      failed,
      failures,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown server error.";
    return res.status(500).json({
      ok: false,
      error: message,
    });
  }
}
