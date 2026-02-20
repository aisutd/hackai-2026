import { createHmac, timingSafeEqual } from "crypto";

export const ADMIN_SESSION_COOKIE_NAME = "hackai_admin_session";
export const ADMIN_BYPASS_COOKIE_NAME = "hackai_admin_bypass";
export const ADMIN_SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 8; // 8 hours

const normalizeEmail = (value: string) => value.trim().toLowerCase();

export const getAdminAccessCode = () => process.env.ADMIN_ACCESS_CODE || "000000";
export const getAdminBypassCode = () => process.env.ADMIN_BYPASS_CODE || "100000";

export const getAllowedAdminEmails = () => {
  const raw = process.env.ADMIN_ALLOWED_EMAILS || "";
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map(normalizeEmail);
};

export const isAllowedAdminEmail = (email: string) => {
  const allowList = getAllowedAdminEmails();
  if (!allowList.length) return true;
  return allowList.includes(normalizeEmail(email));
};

const getBypassSecret = () =>
  process.env.ADMIN_BYPASS_SECRET || process.env.FIREBASE_PROJECT_ID || "hackai-local-bypass";

const signBypassPayload = (exp: string) =>
  createHmac("sha256", getBypassSecret()).update(`bypass:${exp}`).digest("hex");

export const createAdminBypassToken = () => {
  const exp = String(Date.now() + ADMIN_SESSION_MAX_AGE_MS);
  const signature = signBypassPayload(exp);
  return `${exp}.${signature}`;
};

export const verifyAdminBypassToken = (token: string) => {
  const [expRaw, signature] = token.split(".");
  if (!expRaw || !signature) return false;

  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp <= Date.now()) return false;

  const expected = signBypassPayload(expRaw);
  const incoming = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  if (incoming.length !== expectedBuf.length) return false;
  return timingSafeEqual(incoming, expectedBuf);
};

export const normalizeAdminEmail = normalizeEmail;
