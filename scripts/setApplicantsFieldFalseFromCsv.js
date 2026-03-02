#!/usr/bin/env node
/*
Set status to rejected for hackers matched from CSV by first + last + email.

Default behavior:
- Uses csv/HackAI Preliminary Sort - Acceptances.csv
- Processes all CSV rows
- Updates collection: hackers
- If status is accepted, changes it to rejected
- Writes unmatched rows report to csv/unmatched_set_false_rows.csv
*/

const fs = require("fs");
const path = require("path");
const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const SCRIPT_DIR = __dirname;
const CSV_DIR = path.resolve(SCRIPT_DIR, "../csv");
const DEFAULT_CSV_PATH = path.join(CSV_DIR, "HackAI Preliminary Sort - Acceptances.csv");
const DEFAULT_UNMATCHED_PATH = path.join(CSV_DIR, "unmatched_set_false_rows.csv");
const DEFAULT_COLLECTION = "hackers";
const DEFAULT_LIMIT = 0;

function loadEnvLocalFile(envFile = ".env.local") {
  const envPath = path.resolve(process.cwd(), envFile);
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const idx = line.indexOf("=");
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function parseArgs(argv) {
  const args = {
    csv: DEFAULT_CSV_PATH,
    unmatchedOut: DEFAULT_UNMATCHED_PATH,
    collection: process.env.FIRESTORE_COLLECTION || DEFAULT_COLLECTION,
    limit: Number(process.env.ACCEPTANCE_LIMIT || DEFAULT_LIMIT),
  };

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--csv" && argv[i + 1]) {
      args.csv = argv[i + 1];
      i += 1;
      continue;
    }
    if (token === "--unmatched-out" && argv[i + 1]) {
      args.unmatchedOut = argv[i + 1];
      i += 1;
      continue;
    }
    if (token === "--collection" && argv[i + 1]) {
      args.collection = argv[i + 1];
      i += 1;
      continue;
    }
    if (token === "--limit" && argv[i + 1]) {
      const parsed = Number(argv[i + 1]);
      if (Number.isFinite(parsed) && parsed > 0) args.limit = parsed;
      i += 1;
      continue;
    }
  }

  args.csv = path.resolve(process.cwd(), args.csv);
  args.unmatchedOut = path.resolve(process.cwd(), args.unmatchedOut);
  return args;
}

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\s+/g, " ");
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeName(value) {
  return normalizeText(value).toLowerCase();
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase();
}

function getFirstName(data) {
  const keys = ["fname", "first_name", "firstName", "first", "firstname"];
  for (const key of keys) {
    if (normalizeText(data[key])) return normalizeText(data[key]);
  }
  const full = normalizeText(data.name);
  if (full) return full.split(" ")[0];
  return "";
}

function getLastName(data) {
  const keys = ["lname", "last_name", "lastName", "last", "lastname"];
  for (const key of keys) {
    if (normalizeText(data[key])) return normalizeText(data[key]);
  }
  const full = normalizeText(data.name);
  if (!full) return "";
  const parts = full.split(" ").filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : "";
}

function getEmail(data) {
  const keys = ["email", "school_email", "schoolEmail", "personal_email", "personalEmail"];
  for (const key of keys) {
    if (normalizeText(data[key])) return normalizeText(data[key]);
  }
  return "";
}

function parseCsv(content) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < content.length; i += 1) {
    const ch = content[i];
    if (inQuotes) {
      if (ch === '"') {
        if (content[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (ch === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
      continue;
    }
    field += ch;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }

  return rows;
}

function valueFromRow(rowMap, aliases) {
  for (const alias of aliases) {
    const key = normalizeHeader(alias);
    if (Object.prototype.hasOwnProperty.call(rowMap, key)) {
      return normalizeText(rowMap[key]);
    }
  }
  return "";
}

function parseCsvRows(csvPath, maxRows) {
  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV file not found: ${csvPath}`);
  }

  const raw = fs.readFileSync(csvPath, "utf8").replace(/^\uFEFF/, "");
  const table = parseCsv(raw);
  if (!table.length) {
    throw new Error("CSV has no rows.");
  }

  const headers = table[0].map((h) => normalizeHeader(h));
  if (!headers.length) {
    throw new Error("CSV has no header row.");
  }

  const parsedRows = [];
  const badRows = [];
  let seen = 0;

  for (let i = 1; i < table.length; i += 1) {
    if (maxRows > 0 && seen >= maxRows) break;
    const rawRow = table[i];
    const rowNumber = i + 1;
    if (!rawRow || rawRow.every((cell) => normalizeText(cell) === "")) continue;
    seen += 1;

    const mapped = {};
    for (let c = 0; c < headers.length; c += 1) {
      mapped[headers[c]] = rawRow[c] || "";
    }

    const firstRaw = valueFromRow(mapped, ["first", "first name", "fname", "firstname"]);
    const lastRaw = valueFromRow(mapped, ["last name", "last", "lname", "lastname"]);
    const emailRaw = valueFromRow(mapped, ["email", "email address"]);

    const firstName = normalizeName(firstRaw);
    const lastName = normalizeName(lastRaw);
    const email = normalizeEmail(emailRaw);

    if (!firstName || !lastName || !email) {
      badRows.push({
        row_number: String(rowNumber),
        first_name: firstRaw,
        last_name: lastRaw,
        email: emailRaw,
        reason: "Missing one or more required values (first, last name, email).",
      });
      continue;
    }

    parsedRows.push({ rowNumber, firstName, lastName, email });
  }

  return { parsedRows, badRows };
}

function csvEscape(value) {
  const v = String(value ?? "");
  if (v.includes(",") || v.includes('"') || v.includes("\n")) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

function writeUnmatchedReport(outPath, rows) {
  const header = ["row_number", "first_name", "last_name", "email", "reason"];
  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push(
      [
        csvEscape(row.row_number),
        csvEscape(row.first_name),
        csvEscape(row.last_name),
        csvEscape(row.email),
        csvEscape(row.reason),
      ].join(",")
    );
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${lines.join("\n")}\n`, "utf8");
}

function initFirestore() {
  if (!getApps().length) {
    const serviceAccountPath = (process.env.FIREBASE_SERVICE_ACCOUNT_PATH || "serviceAccountKey.json").trim();
    const resolvedServicePath = path.resolve(process.cwd(), serviceAccountPath);

    let appCredential = null;
    if (fs.existsSync(resolvedServicePath)) {
      const raw = fs.readFileSync(resolvedServicePath, "utf8");
      appCredential = cert(JSON.parse(raw));
    } else {
      const projectId = (process.env.FIREBASE_PROJECT_ID || "").trim();
      const clientEmail = (process.env.FIREBASE_CLIENT_EMAIL || "").trim();
      const privateKey = (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n").trim();

      if (!projectId || !clientEmail || !privateKey) {
        throw new Error(
          `Service account file not found at '${resolvedServicePath}', and FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY are not fully set.`
        );
      }

      appCredential = cert({
        type: "service_account",
        project_id: projectId,
        client_email: clientEmail,
        private_key: privateKey,
      });
    }

    initializeApp({ credential: appCredential });
  }
  return getFirestore();
}

async function loadHackers(db, collectionName) {
  const byEmail = new Map();
  const snap = await db.collection(collectionName).get();
  snap.forEach((docSnap) => {
    const data = docSnap.data() || {};
    const email = normalizeEmail(getEmail(data));
    if (!email) return;
    const record = {
      docId: docSnap.id,
      firstName: normalizeName(getFirstName(data)),
      lastName: normalizeName(getLastName(data)),
      email,
      data,
      status: normalizeText(data.status).toLowerCase(),
    };
    if (!byEmail.has(email)) byEmail.set(email, []);
    byEmail.get(email).push(record);
  });
  return byEmail;
}

async function main() {
  loadEnvLocalFile();
  const args = parseArgs(process.argv);

  console.log("Initializing Firestore client...");
  const db = initFirestore();

  console.log(`Loading collection '${args.collection}'...`);
  const byEmail = await loadHackers(db, args.collection);
  let loadedWithEmail = 0;
  for (const list of byEmail.values()) loadedWithEmail += list.length;
  console.log(`Loaded ${loadedWithEmail} records with email from Firestore.`);
  console.log(
    `Loading CSV rows from ${args.csv} (${args.limit > 0 ? `limit=${args.limit}` : "all rows"})...`
  );

  const { parsedRows, badRows } = parseCsvRows(args.csv, args.limit);
  const unmatched = [...badRows];

  console.log(
    `Starting status updates for ${args.limit > 0 ? `up to ${args.limit}` : "all"} CSV rows...`
  );
  console.log(`Collection: ${args.collection}`);
  console.log(`CSV file: ${args.csv}`);

  let matchedCount = 0;
  let alreadyRejectedOrOther = 0;
  let updatedCount = 0;

  for (const row of parsedRows) {
    const displayName = `${row.firstName} ${row.lastName}`.trim();
    console.log(`[ROW ${row.rowNumber}] Processing ${displayName} <${row.email}>`);

    const candidates = byEmail.get(row.email) || [];
    if (!candidates.length) {
      const reason = "Email not found in Firestore collection.";
      unmatched.push({
        row_number: String(row.rowNumber),
        first_name: row.firstName,
        last_name: row.lastName,
        email: row.email,
        reason,
      });
      console.log(`[ROW ${row.rowNumber}] Unmatched: ${reason}`);
      continue;
    }

    const nameMatches = candidates.filter(
      (candidate) => candidate.firstName === row.firstName && candidate.lastName === row.lastName
    );

    if (nameMatches.length === 1) {
      matchedCount += 1;
      const docData = nameMatches[0];
      if (docData.status !== "accepted") {
        alreadyRejectedOrOther += 1;
        console.log(
          `[ROW ${row.rowNumber}] Skipped (status=${docData.status || "unknown"}, doc=${docData.docId}).`
        );
        continue;
      }

      try {
        await db.collection(args.collection).doc(docData.docId).update({
          status: "rejected",
          updatedAt: FieldValue.serverTimestamp(),
        });
        updatedCount += 1;
        console.log(`[ROW ${row.rowNumber}] Updated status to rejected (doc=${docData.docId}).`);
      } catch (err) {
        const reason = `Update failed for doc ${docData.docId}: ${err?.message || String(err)}`;
        unmatched.push({
          row_number: String(row.rowNumber),
          first_name: row.firstName,
          last_name: row.lastName,
          email: row.email,
          reason,
        });
        console.log(`[ROW ${row.rowNumber}] Unmatched: ${reason}`);
      }
      continue;
    }

    if (nameMatches.length > 1) {
      const reason = "Ambiguous match: multiple Firestore docs have same first+last+email.";
      unmatched.push({
        row_number: String(row.rowNumber),
        first_name: row.firstName,
        last_name: row.lastName,
        email: row.email,
        reason,
      });
      console.log(`[ROW ${row.rowNumber}] Unmatched: ${reason}`);
      continue;
    }

    const candidateNames = Array.from(
      new Set(
        candidates.map((candidate) => `${candidate.firstName} ${candidate.lastName}`.trim()).filter(Boolean)
      )
    ).sort();
    const reason = `Email found but first/last name mismatch. Firestore names: ${candidateNames.join(", ") || "n/a"}`;
    unmatched.push({
      row_number: String(row.rowNumber),
      first_name: row.firstName,
      last_name: row.lastName,
      email: row.email,
      reason,
    });
    console.log(`[ROW ${row.rowNumber}] Unmatched: ${reason}`);
  }

  writeUnmatchedReport(args.unmatchedOut, unmatched);

  console.log("\nDone.");
  console.log(`CSV rows parsed: ${parsedRows.length}`);
  console.log(`Matched exact rows: ${matchedCount}`);
  console.log(`Skipped (status not accepted): ${alreadyRejectedOrOther}`);
  console.log(`Updated accepted -> rejected: ${updatedCount}`);
  console.log(`Unmatched rows: ${unmatched.length}`);
  console.log(`Unmatched report: ${args.unmatchedOut}`);

  if (unmatched.length > 0) {
    console.log("\nUnmatched entries:");
    for (const item of unmatched) {
      console.log(
        `- row ${item.row_number}: ${item.first_name} ${item.last_name} <${item.email}> -> ${item.reason}`
      );
    }
  }
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
