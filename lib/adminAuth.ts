export const ADMIN_SESSION_COOKIE_NAME = "hackai_admin_session";
export const ADMIN_SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 8; // 8 hours

const normalizeEmail = (value: string) => value.trim().toLowerCase();

export const getAdminAccessCode = () => process.env.ADMIN_ACCESS_CODE || "000000";

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

export const normalizeAdminEmail = normalizeEmail;
