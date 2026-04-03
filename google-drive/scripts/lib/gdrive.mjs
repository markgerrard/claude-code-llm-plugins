/**
 * Google Drive API client — uses googleapis SDK with OAuth2.
 */

import { google } from "googleapis";
import { readFile, writeFile } from "fs/promises";
import { createReadStream, createWriteStream } from "fs";
import { basename, join, dirname, extname } from "path";
import { fileURLToPath } from "url";
import { pipeline } from "stream/promises";
import fs from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_DIR = join(__dirname, "..", "config");
const TOKEN_PATH = join(CONFIG_DIR, "token.json");

const FILE_FIELDS = "id, name, mimeType, size, modifiedTime, parents, webViewLink";

const MIME_MAP = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml",
  ".pdf": "application/pdf", ".csv": "text/csv", ".txt": "text/plain",
  ".json": "application/json", ".html": "text/html", ".xml": "application/xml",
  ".zip": "application/zip", ".md": "text/markdown",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

const EXPORT_MAP = {
  "application/vnd.google-apps.document":     { mime: "application/pdf", ext: ".pdf" },
  "application/vnd.google-apps.spreadsheet":  { mime: "text/csv",        ext: ".csv" },
  "application/vnd.google-apps.presentation": { mime: "application/pdf", ext: ".pdf" },
  "application/vnd.google-apps.drawing":      { mime: "image/png",       ext: ".png" },
};

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

function loadEnvFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    const vars = {};
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx === -1) continue;
      vars[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
    }
    return vars;
  } catch {
    return {};
  }
}

function getCredentials() {
  const envFiles = [
    join(process.cwd(), ".gdrive", ".env"),
    join(process.env.HOME || "", ".gdrive", ".env"),
  ];

  let env = { ...process.env };
  for (const f of envFiles) {
    const vars = loadEnvFile(f);
    for (const [k, v] of Object.entries(vars)) {
      if (!env[k]) env[k] = v;
    }
  }

  return {
    clientId: env.GOOGLE_CLIENT_ID || null,
    clientSecret: env.GOOGLE_CLIENT_SECRET || null,
  };
}

let _auth;

async function getAuth() {
  if (_auth) return _auth;

  const creds = getCredentials();
  if (!creds.clientId || !creds.clientSecret) {
    throw new Error(
      "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET not set.\n" +
      "Set them in ~/.gdrive/.env or your environment.\n" +
      "Then run /gdrive:auth to authenticate."
    );
  }

  const oauth2 = new google.auth.OAuth2(creds.clientId, creds.clientSecret, "http://localhost:3456");

  // Try plugin config dir first, then home dir
  let tokenPath = TOKEN_PATH;
  const homeTokenPath = join(process.env.HOME || "", ".gdrive", "token.json");

  let raw;
  try {
    raw = await readFile(tokenPath, "utf-8");
  } catch {
    try {
      raw = await readFile(homeTokenPath, "utf-8");
      tokenPath = homeTokenPath;
    } catch {
      throw new Error(
        "No OAuth token found.\n" +
        "Run /gdrive:auth to authenticate with Google Drive."
      );
    }
  }

  const tokens = JSON.parse(raw);
  oauth2.setCredentials(tokens);

  // Persist refreshed tokens
  oauth2.on("tokens", async (fresh) => {
    const merged = { ...tokens, ...fresh };
    await writeFile(tokenPath, JSON.stringify(merged, null, 2)).catch(() => {});
  });

  _auth = oauth2;
  return oauth2;
}

function getDrive() {
  return getAuth().then((auth) => google.drive({ version: "v3", auth }));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function checkConfig() {
  const creds = getCredentials();
  const hasToken = fs.existsSync(TOKEN_PATH) ||
    fs.existsSync(join(process.env.HOME || "", ".gdrive", "token.json"));
  return {
    hasClientId: !!creds.clientId,
    hasClientSecret: !!creds.clientSecret,
    hasToken,
    clientIdPreview: creds.clientId ? creds.clientId.slice(0, 20) + "..." : null,
  };
}

export async function verifyConnection() {
  try {
    const drive = await getDrive();
    const res = await drive.about.get({ fields: "user" });
    return { ok: true, email: res.data.user.emailAddress, name: res.data.user.displayName };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export async function listFiles({ folderId, pageSize } = {}) {
  const drive = await getDrive();
  const q = folderId
    ? `'${folderId}' in parents and trashed = false`
    : `'root' in parents and trashed = false`;

  const res = await drive.files.list({
    q,
    pageSize: pageSize || 25,
    fields: `files(${FILE_FIELDS})`,
    orderBy: "modifiedTime desc",
  });
  return res.data.files;
}

export async function searchFiles({ query, pageSize } = {}) {
  const drive = await getDrive();
  const escaped = query.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

  const res = await drive.files.list({
    q: `fullText contains '${escaped}' and trashed = false`,
    pageSize: pageSize || 25,
    fields: `files(${FILE_FIELDS})`,
    orderBy: "modifiedTime desc",
  });
  return res.data.files;
}

export async function uploadFile({ localPath, name, folderId }) {
  const drive = await getDrive();
  const metadata = { name: name || basename(localPath) };
  if (folderId) metadata.parents = [folderId];

  const mime = MIME_MAP[extname(localPath).toLowerCase()] || "application/octet-stream";
  const res = await drive.files.create({
    requestBody: metadata,
    media: { mimeType: mime, body: createReadStream(localPath) },
    fields: FILE_FIELDS,
  });
  return res.data;
}

export async function downloadFile({ fileId, savePath }) {
  const drive = await getDrive();
  const meta = await drive.files.get({ fileId, fields: "name, mimeType" });
  const exp = EXPORT_MAP[meta.data.mimeType];
  let dest = savePath;

  if (exp) {
    if (!dest.endsWith(exp.ext)) dest += exp.ext;
    const res = await drive.files.export({ fileId, mimeType: exp.mime }, { responseType: "stream" });
    await pipeline(res.data, createWriteStream(dest));
  } else {
    const res = await drive.files.get({ fileId, alt: "media" }, { responseType: "stream" });
    await pipeline(res.data, createWriteStream(dest));
  }

  return { name: meta.data.name, path: dest };
}

export async function createFolder({ name, parentId }) {
  const drive = await getDrive();
  const metadata = { name, mimeType: "application/vnd.google-apps.folder" };
  if (parentId) metadata.parents = [parentId];

  const res = await drive.files.create({ requestBody: metadata, fields: FILE_FIELDS });
  return res.data;
}

export async function deleteFile({ fileId }) {
  const drive = await getDrive();
  const meta = await drive.files.get({ fileId, fields: "name" });
  await drive.files.update({ fileId, requestBody: { trashed: true } });
  return { name: meta.data.name, id: fileId };
}
