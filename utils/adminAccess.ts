export const ADMIN_EMAIL = (process.env.NEXT_PUBLIC_ADMIN_EMAIL || "").trim().toLowerCase();

export const isAdminEmail = (email?: string | null): boolean =>
  Boolean(ADMIN_EMAIL) && (email || "").trim().toLowerCase() === ADMIN_EMAIL;
