import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { adminAuth, adminDb } from "@/firebase/admin";

type SendResponse =
  | { ok: true; hackerId: string; email: string; message: string }
  | { ok: false; error: string; details?: string };

const VALID_STATUSES = new Set(["accepted", "waitlist", "rejected"]);
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const getBearerToken = (req: NextApiRequest): string => {
  const authHeader = req.headers.authorization || "";
  const parts = authHeader.split(" ");
  if (parts.length === 2 && parts[0] === "Bearer") {
    return parts[1];
  }
  return "";
};

const normalizeString = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const getFirstName = (data: Record<string, unknown>): string => {
  return (
    normalizeString(data.fname) ||
    normalizeString(data.first_name) ||
    normalizeString(data.firstName) ||
    normalizeString(data.first) ||
    "Hacker"
  );
};

const getLastName = (data: Record<string, unknown>): string => {
  return (
    normalizeString(data.lname) ||
    normalizeString(data.last_name) ||
    normalizeString(data.lastName) ||
    normalizeString(data.last) ||
    ""
  );
};

const getCode = (hackerId: string, data: Record<string, unknown>): string => {
  return normalizeString(data.access_code) || normalizeString(data.accessCode) || hackerId;
};

const buildEmailBodies = (
  firstName: string,
  lastName: string,
  accessCode: string,
  footerSrc: string
) => {
  const fullName = `${firstName} ${lastName}`.trim() || "Hacker";
  const text = `Hello ${fullName}!

The wait is over. We received an incredible volume of applications this year, and we are so excited to finally welcome you to HackAI 2026: Make Your Mark. 🔍
Please read this email in full to ensure you don't miss any information!

🏁 Check Your Status:
To see if you have been accepted, please make an account on the HackAI portal and enter your unique 6-digit code.
Your Unique Code: ${accessCode}
Website Link: https://www.hackai.org/
Note: This code is unique to your email. Please do not share it with anyone.

🕒 Check-In Logistics
We want to make sure the morning goes smoothly. Please follow the timing for your specific status:
If You Are ACCEPTED:
- Check-In Window: 7:30 AM - 9:30 AM.
- Requirements: Please bring a valid form of ID (Government ID or Comet Card) so we can verify your identity at the door.
- If you are traveling far and will not be able to arrive on time, please let us know in advance so we can ensure space for you.

If You Are REJECTED:
- This is NOT a reflection of your qualifications or abilities, it is simply due to the number of hackers we can accommodate this weekend.
- If you are still excited to participate, don't worry - you can join our waitlist to compete in HackAI.
- Arrival: You may begin lining up at 7:00 AM.
- Process: Once we have checked in our accepted hackers, we will begin admitting waitlisted individuals based on remaining space availability. While we can't guarantee a spot for everyone, we will do our best to get as many of you in as possible!

🍕 Food & Dietary Notes
We want everyone to enjoy their meal! We'll do our best to provide options for various diets, but since we can't guarantee every restriction can be catered to, please feel free to bring along any personal favorites or essentials you might need.

🤝 Teams & Community
Need a Team? Don't worry! We are hosting an in-person team-building event immediately after the opening ceremony, and you are welcome to change and alter your teams up until midnight of March 7th.
Join the Discord: https://discord.gg/pxs9TtVV6v
Follow us on Instagram: https://www.instagram.com/utdais/
All communication during the event will be on Discord. If you are not on Discord throughout the duration of HackAI, we are not responsible for missed communications.

Questions? Reach out anytime at utd.ais@aisociety.io.

— Artificial Intelligence Society: The HackAI Team`;

  const html = `
<html>
  <body>
    <p>Hello ${fullName}!</p>
    <p>
      The wait is over. We received an incredible volume of applications this year, and we are so excited
      to bring you HackAI 2026: Make Your Mark. 🔍
      Please read this email in full to ensure you don&apos;t miss any information!
    </p>

    <h3>🏁 Check Your Status</h3>
    <p>
      To see if you have been accepted, please make an account on the HackAI portal and enter your unique 6-digit code.
      <br />
      <strong>Your Unique Code:</strong> ${accessCode}
      <br />
      <strong>Website Link:</strong> <a href="https://www.hackai.org/">https://www.hackai.org/</a>
      <br />
      <em>Note: This code is unique to your email. Please do not share it with anyone.</em>
    </p>

    <h3>🕒 Check-In Logistics</h3>
    <p>We want to make sure the morning goes smoothly. Please follow the timing for your specific status:</p>
    <p><strong>If You Are <span style="color:#22c55e;">ACCEPTED</span>:</strong></p>
    <ul>
      <li>Check-In Window: 7:30 AM - 9:30 AM.</li>
      <li>Bring a valid form of ID (Government ID or Comet Card) for identity verification.</li>
      <li>If you are traveling far and may arrive late, please let us know in advance.</li>
    </ul>

    <p><strong>If You Are <span style="color:#facc15;">REJECTED</span>:</strong></p>
    <ul>
      <li>This is not a reflection of your qualifications or abilities; capacity is limited.</li>
      <li>You can still join our waitlist to compete in HackAI.</li>
      <li>Arrival: You may begin lining up at 7:00 AM.</li>
      <li>
        Admission from waitlist begins after accepted hackers are checked in and as space allows. While we
        can&apos;t guarantee a spot for everyone, we will do our best to get as many of you in as possible.
      </li>
    </ul>

    <h3>🍕 Food &amp; Dietary Notes</h3>
    <p>
      We want everyone to enjoy their meal! We&apos;ll do our best to provide options for various diets, but since
      we can&apos;t guarantee every restriction can be catered to, please feel free to bring along any personal
      favorites or essentials you might need.
    </p>

    <h3>🤝 Teams &amp; Community</h3>
    <p>
      Need a Team? Don&apos;t worry! We are hosting an in-person team-building event immediately after the opening ceremony,
      and you are welcome to change and alter your teams up until midnight of March 7th.
    </p>
    <p>
      Join the Discord:
      <a href="https://discord.gg/pxs9TtVV6v">https://discord.gg/pxs9TtVV6v</a>
      <br />
      Follow us on Instagram:
      <a href="https://www.instagram.com/utdais/">https://www.instagram.com/utdais/</a>
    </p>
    <p>
      All communication during the event will be on Discord. If you are not on the Discord throughout the duration
      of HackAI, we are not responsible for missed communications.
    </p>

    <p>Questions? Reach out anytime at <a href="mailto:utd.ais@aisociety.io">utd.ais@aisociety.io</a>.</p>
    <p>&mdash; Artificial Intelligence Society: The HackAI Team</p>
    <div style="margin-top:24px;">
      <img
        src="${footerSrc}"
        alt="HackAI 2026"
        style="display:block; width:100%; max-width:280px; height:auto; border:0; outline:none; text-decoration:none;"
      />
    </div>
  </body>
</html>
`;

  return { text, html };
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SendResponse>
) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    // Lazy load so the project can still typecheck before dependency install.
    let nodemailer: {
      createTransport: (cfg: Record<string, unknown>) => {
        sendMail: (msg: Record<string, unknown>) => Promise<void>;
      };
    };
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      nodemailer = require("nodemailer");
    } catch {
      return res.status(500).json({
        ok: false,
        error: "nodemailer is not installed on the server. Run: npm install nodemailer",
      });
    }

    const token = getBearerToken(req);
    if (!token) {
      return res.status(401).json({ ok: false, error: "Missing auth token." });
    }

    const decoded = await adminAuth.verifyIdToken(token, true);
    const callerEmail = normalizeString(decoded.email).toLowerCase();
    const adminEmail = normalizeString(process.env.NEXT_PUBLIC_ADMIN_EMAIL).toLowerCase();
    if (!adminEmail) {
      return res.status(500).json({
        ok: false,
        error: "ADMIN_EMAIL is not configured on the server.",
      });
    }
    if (decoded.email_verified !== true) {
      return res.status(403).json({ ok: false, error: "Verified admin account required." });
    }
    if (!callerEmail || callerEmail !== adminEmail) {
      return res.status(403).json({ ok: false, error: "Admin access required." });
    }

    const smtpEmail = normalizeString(process.env.SMTP_EMAIL);
    const smtpPassword = normalizeString(process.env.SMTP_APP_PASSWORD);
    if (!smtpEmail || !smtpPassword) {
      return res.status(500).json({
        ok: false,
        error: "SMTP_EMAIL and SMTP_APP_PASSWORD must be configured on the server.",
      });
    }

    const hackerId = normalizeString(req.body?.hackerId);
    if (!/^\d{6}$/.test(hackerId)) {
      return res.status(400).json({ ok: false, error: "Invalid hacker ID." });
    }

    const hackerRef = adminDb.collection("hackers").doc(hackerId);
    const hackerSnap = await hackerRef.get();
    if (!hackerSnap.exists) {
      return res.status(404).json({ ok: false, error: "Hacker not found." });
    }

    const hackerData = (hackerSnap.data() || {}) as Record<string, unknown>;
    const email = normalizeString(hackerData.email).toLowerCase();
    if (!email || !EMAIL_RE.test(email)) {
      return res.status(400).json({ ok: false, error: "Hacker email is invalid or missing." });
    }

    const status = normalizeString(hackerData.status).toLowerCase();
    if (!VALID_STATUSES.has(status)) {
      return res.status(400).json({
        ok: false,
        error: `Status must be accepted/rejected/waitlist to send (current: ${status || "unknown"}).`,
      });
    }

    const firstName = getFirstName(hackerData);
    const lastName = getLastName(hackerData);
    const accessCode = getCode(hackerId, hackerData);

    const footerPath = path.join(process.cwd(), "public", "Email", "emailImage.png");
    const footerExists = fs.existsSync(footerPath);
    const footerSrc = footerExists ? "cid:hackai-footer-image" : "https://www.hackai.org/Home/hackAiLogoColor.webp";
    const { text, html } = buildEmailBodies(firstName, lastName, accessCode, footerSrc);

    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: smtpEmail, pass: smtpPassword },
    });

    await transporter.sendMail({
      from: smtpEmail,
      to: email,
      subject: "🛹 HackAI 2026: Your Application Status & Event Details",
      text,
      html,
      attachments: footerExists
        ? [
            {
              filename: "emailImage.png",
              path: footerPath,
              cid: "hackai-footer-image",
            },
          ]
        : [],
    });

    await hackerRef.update({
      emailSendStatus: "sent",
      emailSentBy: callerEmail,
    });

    return res.status(200).json({
      ok: true,
      hackerId,
      email,
      message: `Email sent to ${email}.`,
    });
  } catch (err: unknown) {
    const details = err instanceof Error ? err.message : "Unknown error";
    return res.status(500).json({
      ok: false,
      error: "Failed to send email.",
      details,
    });
  }
}
