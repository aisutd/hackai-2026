import type { NextApiRequest, NextApiResponse } from "next";
import { ADMIN_SESSION_COOKIE_NAME } from "@/lib/adminAuth";

type Response = { ok: true };

const clearSessionCookie = () => {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${ADMIN_SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
};

export default function handler(req: NextApiRequest, res: NextApiResponse<Response>) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end();
  }

  res.setHeader("Set-Cookie", clearSessionCookie());
  return res.status(200).json({ ok: true });
}
