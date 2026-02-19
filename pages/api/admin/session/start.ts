import type { NextApiRequest, NextApiResponse } from "next";
import { adminAuth } from "@/firebase/admin";
import {
  ADMIN_SESSION_COOKIE_NAME,
  ADMIN_SESSION_MAX_AGE_MS,
  getAdminAccessCode,
  isAllowedAdminEmail,
  normalizeAdminEmail,
} from "@/lib/adminAuth";

type ErrorResponse = { error: string };
type SuccessResponse = { ok: true; email: string };

const makeSessionCookie = (token: string) => {
  const maxAgeSeconds = Math.floor(ADMIN_SESSION_MAX_AGE_MS / 1000);
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${ADMIN_SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ErrorResponse | SuccessResponse>
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const idToken = typeof req.body?.idToken === "string" ? req.body.idToken : "";
  const accessCode = typeof req.body?.accessCode === "string" ? req.body.accessCode : "";
  const claimedEmail =
    typeof req.body?.claimedEmail === "string" ? req.body.claimedEmail : "";

  if (!idToken || !accessCode || !claimedEmail) {
    return res.status(400).json({ error: "Missing login fields." });
  }

  if (accessCode !== getAdminAccessCode()) {
    return res.status(401).json({ error: "Invalid admin code." });
  }

  try {
    const decoded = await adminAuth.verifyIdToken(idToken, true);
    const authenticatedEmail = normalizeAdminEmail(decoded.email || "");
    const expectedEmail = normalizeAdminEmail(claimedEmail);

    if (!authenticatedEmail || authenticatedEmail !== expectedEmail) {
      return res
        .status(401)
        .json({ error: "Authenticated account does not match admin email." });
    }

    if (!isAllowedAdminEmail(authenticatedEmail)) {
      return res.status(403).json({ error: "Email is not allowed for admin access." });
    }

    const sessionCookie = await adminAuth.createSessionCookie(idToken, {
      expiresIn: ADMIN_SESSION_MAX_AGE_MS,
    });

    res.setHeader("Set-Cookie", makeSessionCookie(sessionCookie));
    return res.status(200).json({ ok: true, email: authenticatedEmail });
  } catch {
    return res.status(401).json({ error: "Unable to verify admin login." });
  }
}
