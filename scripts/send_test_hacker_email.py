#!/usr/bin/env python3
"""
Send HackAI emails from Firestore using Gmail SMTP.

Default behavior:
- Reads from Firestore collection: hackers
- Sends to all eligible rows
- Skips rows if:
  - email already received a successful send in this run
  - row already has emailSentAt/email_sent_at/lastEmailSentAt in Firestore
  - first+last name appears with multiple different emails
  - email is invalid

Runtime controls:
- Edit USER_SETTINGS below directly in this file.

Firebase credentials:
- FIREBASE_SERVICE_ACCOUNT_PATH
  or
- FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY

SMTP credentials:
- SMTP_EMAIL / SMTP_APP_PASSWORD in USER_SETTINGS
  (or leave blank there and use env/.env.local fallback)
"""

from __future__ import annotations

import csv
import os
import re
import smtplib
import time
from dataclasses import dataclass
from datetime import datetime
from email.message import EmailMessage
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import firebase_admin
from firebase_admin import credentials, firestore
from google.api_core.exceptions import DeadlineExceeded

EMAIL_SUBJECT = "🛹 HackAI 2026: Your Application Status & Event Details"
VALID_STATUSES = {"accepted", "waitlist", "rejected"}
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


# ------------------------------
# USER SETTINGS (edit these)
# ------------------------------
USER_SETTINGS = {
    "SMTP_EMAIL": "",  # ex: "utd.ais@aisociety.io"
    "SMTP_APP_PASSWORD": "",  # Gmail app password
    "FIREBASE_SERVICE_ACCOUNT_PATH": "serviceAccountKey.json",
    "FIREBASE_PROJECT_ID": "",
    "FIREBASE_CLIENT_EMAIL": "",
    "FIREBASE_PRIVATE_KEY": "",
    "FIRESTORE_COLLECTION": "hackers",
    "EMAIL_FOOTER_IMAGE_PATH": "public/Email/emailImage.png",
    "EMAIL_FOOTER_IMAGE_URL": "https://www.hackai.org/Home/hackAiLogoColor.webp",
    "DRY_RUN": False,
    "COUNT_ONLY": False,
    "TEST_MODE": False,
    "TEST_RECEIVER_EMAIL": "",  # required when TEST_MODE=True
    "SEND_DELAY_SECONDS": 2.0,
    "BATCH_SIZE": 50,
    "BATCH_PAUSE_SECONDS": 20.0,
    "SEND_LIMIT": 0,  # 0 means no limit; 1 means only first eligible row
    "TARGET_ACCESS_CODE": "",  # blank means all access codes
    "FORCE_SEND_TARGET": False,  # if true with TARGET_ACCESS_CODE, bypasses already-sent/duplicate skip checks
}


@dataclass
class CandidateRow:
    doc_id: str
    first_name: str
    last_name: str
    full_name: str
    name_key: str
    email: str
    status: str
    access_code: str
    raw_data: Dict[str, Any]
    doc_ref: Any


@dataclass
class SkippedRow:
    doc_id: str
    full_name: str
    email: str
    reason: str
    detail: str = ""


def parse_bool(value: str, default: bool = False) -> bool:
    if value is None:
        return default
    raw = value.strip().lower()
    if raw in {"1", "true", "yes", "y", "on"}:
        return True
    if raw in {"0", "false", "no", "n", "off"}:
        return False
    return default


def to_str(value: Any) -> str:
    return value if isinstance(value, str) else ""


def normalize_email(value: str) -> str:
    return value.strip().lower()


def is_valid_email(value: str) -> bool:
    return bool(EMAIL_RE.match(value))


def normalize_name_part(value: str) -> str:
    return " ".join(value.strip().lower().split())


def load_env_local_file(env_file: str = ".env.local") -> None:
    env_path = Path(env_file)
    if not env_path.exists():
        return

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if (
            (value.startswith('"') and value.endswith('"'))
            or (value.startswith("'") and value.endswith("'"))
        ):
            value = value[1:-1]
        if key and key not in os.environ:
            os.environ[key] = value


def get_by_keys(data: Dict[str, Any], keys: List[str]) -> str:
    normalized = {k.lower().replace("_", ""): v for k, v in data.items()}
    for key in keys:
        value = normalized.get(key.lower().replace("_", ""))
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def get_access_code(doc_id: str, data: Dict[str, Any]) -> str:
    raw = data.get("access_code", data.get("accessCode", doc_id))
    return str(raw).strip()


def get_first_name(data: Dict[str, Any]) -> str:
    first = get_by_keys(data, ["fname", "firstName", "first_name", "firstname"])
    if first:
        return first
    full_name = get_by_keys(data, ["name", "fullName", "full_name", "displayName"])
    return full_name.split(" ")[0].strip() if full_name else ""


def get_last_name(data: Dict[str, Any]) -> str:
    last = get_by_keys(data, ["lname", "lastName", "last_name", "lastname"])
    if last:
        return last
    full_name = get_by_keys(data, ["name", "fullName", "full_name", "displayName"])
    parts = [p.strip() for p in full_name.split(" ") if p.strip()] if full_name else []
    return parts[-1] if len(parts) > 1 else ""


def get_primary_email(data: Dict[str, Any]) -> str:
    # Prefer canonical applicant email field.
    candidates = [
        get_by_keys(data, ["email"]),
        get_by_keys(data, ["school_email", "schoolEmail"]),
        get_by_keys(data, ["personal_email", "personalEmail"]),
    ]
    for candidate in candidates:
        if candidate:
            return normalize_email(candidate)
    return ""


def load_config() -> Dict[str, Any]:
    def pick_str(key: str, default: str = "") -> str:
        env_value = os.getenv(key)
        if env_value is not None and env_value.strip() != "":
            return env_value.strip()

        configured = USER_SETTINGS.get(key, default)
        if isinstance(configured, str):
            return configured.strip()
        if configured is None:
            return default
        return str(configured).strip()

    def pick_bool(key: str, default: bool = False) -> bool:
        env_value = os.getenv(key)
        if env_value is not None:
            return parse_bool(env_value, default=default)
        return bool(USER_SETTINGS.get(key, default))

    def pick_int(key: str, default: int) -> int:
        env_value = os.getenv(key)
        if env_value is not None and env_value.strip() != "":
            try:
                return int(env_value.strip())
            except ValueError:
                return default
        configured = USER_SETTINGS.get(key, default)
        try:
            return int(configured)
        except (TypeError, ValueError):
            return default

    def pick_float(key: str, default: float) -> float:
        env_value = os.getenv(key)
        if env_value is not None and env_value.strip() != "":
            try:
                return float(env_value.strip())
            except ValueError:
                return default
        configured = USER_SETTINGS.get(key, default)
        try:
            return float(configured)
        except (TypeError, ValueError):
            return default

    cfg = {
        "smtp_email": pick_str("SMTP_EMAIL", ""),
        "smtp_password": pick_str("SMTP_APP_PASSWORD", ""),
        "service_account_path": pick_str("FIREBASE_SERVICE_ACCOUNT_PATH", "serviceAccountKey.json"),
        "firebase_project_id": pick_str("FIREBASE_PROJECT_ID", ""),
        "firebase_client_email": pick_str("FIREBASE_CLIENT_EMAIL", ""),
        "firebase_private_key": pick_str("FIREBASE_PRIVATE_KEY", ""),
        "collection_name": pick_str("FIRESTORE_COLLECTION", "hackers"),
        "email_footer_image_path": pick_str("EMAIL_FOOTER_IMAGE_PATH", "public/Email/emailImage.png"),
        "email_footer_image_url": pick_str("EMAIL_FOOTER_IMAGE_URL", "https://www.hackai.org/Home/hackAiLogoColor.webp"),
        "dry_run": pick_bool("DRY_RUN", False),
        "count_only": pick_bool("COUNT_ONLY", False),
        "test_mode": pick_bool("TEST_MODE", False),
        "test_receiver": pick_str("TEST_RECEIVER_EMAIL", ""),
        "delay_seconds": pick_float("SEND_DELAY_SECONDS", 2.0),
        "batch_size": pick_int("BATCH_SIZE", 50),
        "batch_pause_seconds": pick_float("BATCH_PAUSE_SECONDS", 20.0),
        "send_limit": pick_int("SEND_LIMIT", 0),
        "target_access_code": pick_str("TARGET_ACCESS_CODE", ""),
        "force_send_target": pick_bool("FORCE_SEND_TARGET", False),
    }

    if not cfg["service_account_path"] and not (
        cfg["firebase_project_id"] and cfg["firebase_client_email"] and cfg["firebase_private_key"]
    ):
        raise ValueError(
            "Provide FIREBASE_SERVICE_ACCOUNT_PATH or all of FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY."
        )
    if not cfg["collection_name"]:
        raise ValueError("FIRESTORE_COLLECTION is required.")
    if cfg["test_mode"] and not cfg["test_receiver"]:
        raise ValueError("TEST_RECEIVER_EMAIL is required when TEST_MODE=true.")
    if cfg["batch_size"] <= 0:
        raise ValueError("BATCH_SIZE must be > 0.")
    if cfg["batch_pause_seconds"] < 0:
        raise ValueError("BATCH_PAUSE_SECONDS must be >= 0.")
    if cfg["send_limit"] < 0:
        raise ValueError("SEND_LIMIT must be >= 0.")
    if not cfg["dry_run"] and (not cfg["smtp_email"] or not cfg["smtp_password"]):
        raise ValueError("SMTP_EMAIL and SMTP_APP_PASSWORD are required when DRY_RUN=false.")

    return cfg


def sort_key_for_access_code(value: str) -> Tuple[int, str]:
    code = value.strip()
    if code.isdigit():
        return (0, f"{int(code):010d}")
    return (1, code)


def init_firestore(service_account_path: str):
    if not firebase_admin._apps:
        if os.path.exists(service_account_path):
            cred = credentials.Certificate(service_account_path)
        else:
            project_id = os.getenv("FIREBASE_PROJECT_ID", "").strip()
            client_email = os.getenv("FIREBASE_CLIENT_EMAIL", "").strip()
            private_key = os.getenv("FIREBASE_PRIVATE_KEY", "").replace("\\n", "\n").strip()
            if not (project_id and client_email and private_key):
                raise FileNotFoundError(
                    f"Service account file not found at '{service_account_path}', and FIREBASE_PROJECT_ID / "
                    "FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY are not fully set."
                )
            cred = credentials.Certificate(
                {
                    "type": "service_account",
                    "project_id": project_id,
                    "client_email": client_email,
                    "private_key": private_key,
                    "token_uri": "https://oauth2.googleapis.com/token",
                }
            )
        firebase_admin.initialize_app(cred)
    return firestore.client()


def build_email(
    first_name: str,
    last_name: str,
    access_code: str,
    footer_image_path: str,
    footer_image_url: str,
) -> EmailMessage:
    msg = EmailMessage()
    msg["Subject"] = EMAIL_SUBJECT

    full_name = f"{first_name} {last_name}".strip()
    if not full_name:
        full_name = "Hacker"

    footer_path = Path(footer_image_path)
    footer_cid = "hackai-footer-image"
    footer_img_src = f"cid:{footer_cid}" if footer_path.exists() else footer_image_url

    text_body = f"""Hello {full_name}!

The wait is over. We received an incredible volume of applications this year, and we are so excited to finally welcome you to HackAI 2026: Make Your Mark. 🔍
Please read this email in full to ensure you don't miss any information!

🏁 Check Your Status:
To see if you have been accepted, please make an account on the HackAI portal and enter your unique 6-digit code.
Your Unique Code: {access_code}
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

— Artificial Intelligence Society: The HackAI Team
"""

    html_body = f"""
<html>
  <body>
    <p>Hello {full_name}!</p>
    <p>
      The wait is over. We received an incredible volume of applications this year, and we are so excited
      to bring you HackAI 2026: Make Your Mark. 🔍
      Please read this email in full to ensure you don&apos;t miss any information!
    </p>

    <h3>🏁 Check Your Status</h3>
    <p>
      To see if you have been accepted, please make an account on the HackAI portal and enter your unique 6-digit code.
      <br />
      <strong>Your Unique Code:</strong> {access_code}
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
        src="{footer_img_src}"
        alt="HackAI 2026"
        style="display:block; width:100%; max-width:280px; height:auto; border:0; outline:none; text-decoration:none;"
      />
    </div>
  </body>
</html>
"""
    msg.set_content(text_body)
    msg.add_alternative(html_body, subtype="html")
    if footer_path.exists():
        html_part = msg.get_body(preferencelist=("html",))
        if html_part is not None:
            suffix = footer_path.suffix.lower().lstrip(".") or "png"
            if suffix == "jpg":
                suffix = "jpeg"
            html_part.add_related(
                footer_path.read_bytes(),
                maintype="image",
                subtype=suffix,
                cid=f"<{footer_cid}>",
                filename=footer_path.name,
            )
    return msg


def send_message(smtp_email: str, smtp_password: str, msg: EmailMessage) -> None:
    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as smtp:
        smtp.login(smtp_email, smtp_password)
        smtp.send_message(msg)


def mark_send_success(doc_ref: Any, to_email: str) -> None:
    doc_ref.update(
        {
            "emailSentAt": firestore.SERVER_TIMESTAMP,
            "emailSentTo": to_email,
            "emailSentSubject": EMAIL_SUBJECT,
            "emailSendStatus": "sent",
            "emailSendError": firestore.DELETE_FIELD,
        }
    )


def mark_send_failure(doc_ref: Any, error_text: str) -> None:
    doc_ref.update(
        {
            "emailSendStatus": "failed",
            "emailSendError": error_text[:1000],
            "emailSendTriedAt": firestore.SERVER_TIMESTAMP,
        }
    )


def export_skip_report(skipped: List[SkippedRow]) -> str:
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    report_dir = Path("csv")
    report_dir.mkdir(parents=True, exist_ok=True)
    path = report_dir / f"email_skip_report_{ts}.csv"
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["doc_id", "name", "email", "reason", "detail"])
        for row in skipped:
            writer.writerow([row.doc_id, row.full_name, row.email, row.reason, row.detail])
    return str(path)


def main() -> None:
    load_env_local_file()
    cfg = load_config()
    db = init_firestore(cfg["service_account_path"])

    users_ref = db.collection(cfg["collection_name"])
    if cfg["target_access_code"]:
        targeted_snap = users_ref.document(cfg["target_access_code"]).get()
        docs = [targeted_snap] if targeted_snap.exists else []
    else:
        try:
            docs = list(users_ref.stream(timeout=60))
        except DeadlineExceeded:
            print("Initial fetch timed out. Retrying once more...")
            time.sleep(2)
            docs = list(users_ref.stream(timeout=60))

    print(f"Total rows loaded from {cfg['collection_name']}: {len(docs)}")

    candidates: List[CandidateRow] = []
    skipped: List[SkippedRow] = []
    name_to_emails: Dict[str, set[str]] = {}
    single_target_mode = bool(cfg["target_access_code"])
    force_target_send = single_target_mode and bool(cfg["force_send_target"])

    if single_target_mode and not docs:
        skipped.append(
            SkippedRow(
                cfg["target_access_code"],
                "Unknown",
                "",
                "target_not_found",
                "No matching document found for TARGET_ACCESS_CODE.",
            )
        )

    for doc_snap in docs:
        data = doc_snap.to_dict() or {}
        doc_id = doc_snap.id

        first_name = get_first_name(data)
        last_name = get_last_name(data)
        full_name = f"{first_name} {last_name}".strip() or "Unknown"
        name_key = f"{normalize_name_part(first_name)}::{normalize_name_part(last_name)}"

        status = to_str(data.get("status", "")).strip().lower()
        if status not in VALID_STATUSES:
            skipped.append(
                SkippedRow(doc_id, full_name, "", "invalid_status", f"status='{status}'")
            )
            continue

        email = get_primary_email(data)
        if not email:
            skipped.append(SkippedRow(doc_id, full_name, "", "missing_email", "no email field"))
            continue
        if not is_valid_email(email):
            skipped.append(SkippedRow(doc_id, full_name, email, "invalid_email", "failed email format"))
            continue

        if (not force_target_send) and (
            data.get("emailSentAt") or data.get("email_sent_at") or data.get("lastEmailSentAt")
        ):
            skipped.append(
                SkippedRow(
                    doc_id,
                    full_name,
                    email,
                    "already_sent",
                    "emailSentAt/email_sent_at/lastEmailSentAt exists",
                )
            )
            continue

        access_code = get_access_code(doc_id, data)
        if cfg["target_access_code"] and access_code != cfg["target_access_code"]:
            skipped.append(
                SkippedRow(
                    doc_id,
                    full_name,
                    email,
                    "target_access_code_mismatch",
                    f"expected={cfg['target_access_code']} actual={access_code}",
                )
            )
            continue

        row = CandidateRow(
            doc_id=doc_id,
            first_name=first_name or "Hacker",
            last_name=last_name,
            full_name=full_name,
            name_key=name_key,
            email=email,
            status=status,
            access_code=access_code,
            raw_data=data,
            doc_ref=doc_snap.reference,
        )
        candidates.append(row)
        if normalize_name_part(first_name) and normalize_name_part(last_name):
            name_to_emails.setdefault(name_key, set()).add(email)

    conflicting_name_keys = (
        {key for key, emails in name_to_emails.items() if len(emails) > 1 and key != "::"}
        if not force_target_send
        else set()
    )

    eligible: List[CandidateRow] = []
    seen_emails: set[str] = set()

    for row in candidates:
        if row.name_key in conflicting_name_keys:
            skipped.append(
                SkippedRow(
                    row.doc_id,
                    row.full_name,
                    row.email,
                    "duplicate_name_different_emails",
                    "same first+last appears with different emails",
                )
            )
            continue

        if row.email in seen_emails and not force_target_send:
            skipped.append(
                SkippedRow(
                    row.doc_id,
                    row.full_name,
                    row.email,
                    "duplicate_email_in_run",
                    "email already processed in this run",
                )
            )
            continue

        seen_emails.add(row.email)
        eligible.append(row)

    eligible.sort(key=lambda row: (sort_key_for_access_code(row.access_code), row.doc_id))

    if cfg["send_limit"] > 0 and len(eligible) > cfg["send_limit"]:
        overflow = eligible[cfg["send_limit"] :]
        for row in overflow:
            skipped.append(
                SkippedRow(
                    row.doc_id,
                    row.full_name,
                    row.email,
                    "send_limit_overflow",
                    f"SEND_LIMIT={cfg['send_limit']}",
                )
            )
        eligible = eligible[: cfg["send_limit"]]

    print(f"Eligible rows to process: {len(eligible)}")
    print(
        f"Config: DRY_RUN={cfg['dry_run']} TEST_MODE={cfg['test_mode']} "
        f"SEND_LIMIT={cfg['send_limit']} BATCH_SIZE={cfg['batch_size']} "
        f"TARGET_ACCESS_CODE={cfg['target_access_code'] or 'ALL'} "
        f"FORCE_SEND_TARGET={cfg['force_send_target']}"
    )

    if cfg["count_only"]:
        print("COUNT_ONLY=true, exiting without sending.")
        report_path = export_skip_report(skipped)
        print(f"Skip report written to: {report_path}")
        return

    attempted = 0
    sent = 0
    failed = 0
    failed_rows: List[Tuple[str, str, str]] = []

    for idx, row in enumerate(eligible, start=1):
        if idx > 1 and (idx - 1) % cfg["batch_size"] == 0:
            print(
                f"Batch pause: processed {idx - 1} rows. Sleeping {cfg['batch_pause_seconds']}s..."
            )
            time.sleep(cfg["batch_pause_seconds"])

        attempted += 1

        msg = build_email(
            row.first_name,
            row.last_name,
            row.access_code,
            cfg["email_footer_image_path"],
            cfg["email_footer_image_url"],
        )
        msg["From"] = cfg["smtp_email"] or "utd.ais@aisociety.io"

        target_to = cfg["test_receiver"] if cfg["test_mode"] else row.email
        msg["To"] = target_to

        if cfg["test_mode"]:
            print(
                f"[TEST_MODE] doc={row.doc_id} name={row.full_name} email={row.email} "
                f"status={row.status} access_code={row.access_code} -> {target_to}"
            )
        else:
            print(
                f"Sending doc={row.doc_id} name={row.full_name} email={row.email} "
                f"status={row.status} access_code={row.access_code} to={target_to}"
            )

        if cfg["dry_run"]:
            print("[DRY_RUN] Skipping actual send.")
            continue

        try:
            send_message(cfg["smtp_email"], cfg["smtp_password"], msg)
            mark_send_success(row.doc_ref, row.email)
            sent += 1
            print("Email sent.")
        except Exception as exc:
            failed += 1
            error_text = str(exc)
            failed_rows.append((row.doc_id, row.email, error_text))
            print(f"Failed for doc={row.doc_id}: {error_text}")
            try:
                mark_send_failure(row.doc_ref, error_text)
            except Exception as mark_exc:
                print(f"Warning: could not mark failure in Firestore for doc={row.doc_id}: {mark_exc}")

        time.sleep(cfg["delay_seconds"])

    reason_counts: Dict[str, int] = {}
    for row in skipped:
        reason_counts[row.reason] = reason_counts.get(row.reason, 0) + 1

    report_path = export_skip_report(skipped)

    print("\n=== Email Send Summary ===")
    print(f"Collection: {cfg['collection_name']}")
    print(f"Loaded rows: {len(docs)}")
    print(f"Attempted: {attempted}")
    print(f"Sent: {sent}")
    print(f"Failed: {failed}")
    print(f"Skipped: {len(skipped)}")
    print(f"Skip report: {report_path}")

    if reason_counts:
        print("\nSkipped by reason:")
        for reason in sorted(reason_counts.keys()):
            print(f"- {reason}: {reason_counts[reason]}")

    if failed_rows:
        print("\nFailures:")
        for doc_id, email, err in failed_rows:
            print(f"- doc={doc_id} email={email} error={err}")


if __name__ == "__main__":
    main()
