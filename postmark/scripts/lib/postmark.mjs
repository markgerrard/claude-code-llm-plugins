/**
 * Postmark API client — direct HTTP calls, no SDK dependency.
 */

import fs from "node:fs";
import path from "node:path";

const API_BASE = "https://api.postmarkapp.com";
const DEFAULT_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// Config loading
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
      const key = trimmed.slice(0, idx).trim();
      const value = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
      vars[key] = value;
    }
    return vars;
  } catch {
    return {};
  }
}

function getConfig() {
  // Check env vars first, then .postmark/.env, then ~/.postmark/.env
  const envFiles = [
    path.join(process.cwd(), ".postmark", ".env"),
    path.join(process.env.HOME || "", ".postmark", ".env"),
  ];

  let env = { ...process.env };
  for (const f of envFiles) {
    const vars = loadEnvFile(f);
    for (const [k, v] of Object.entries(vars)) {
      if (!env[k]) env[k] = v;
    }
  }

  return {
    serverToken: env.POSTMARK_SERVER_TOKEN || null,
    defaultSender: env.DEFAULT_SENDER_EMAIL || null,
    defaultStream: env.DEFAULT_MESSAGE_STREAM || "outbound",
  };
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function postmarkFetch(endpoint, options = {}) {
  const config = getConfig();
  if (!config.serverToken) {
    throw new Error(
      "POSTMARK_SERVER_TOKEN not set.\n" +
      "Set it in environment, .postmark/.env, or ~/.postmark/.env"
    );
  }

  const url = `${API_BASE}${endpoint}`;
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "X-Postmark-Server-Token": config.serverToken,
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeout || DEFAULT_TIMEOUT_MS),
  });

  const data = await response.json();
  if (!response.ok) {
    const msg = data?.Message || data?.ErrorCode || response.statusText;
    throw new Error(`Postmark API ${response.status}: ${msg}`);
  }
  return data;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function checkConfig() {
  const config = getConfig();
  return {
    hasToken: !!config.serverToken,
    hasSender: !!config.defaultSender,
    hasStream: !!config.defaultStream,
    defaultSender: config.defaultSender,
    defaultStream: config.defaultStream,
    tokenPreview: config.serverToken ? config.serverToken.slice(0, 8) + "..." : null,
  };
}

export async function verifyConnection() {
  try {
    const data = await postmarkFetch("/server");
    return { ok: true, serverName: data.Name, error: null };
  } catch (err) {
    return { ok: false, serverName: null, error: err.message };
  }
}

export async function sendEmail({ to, subject, textBody, htmlBody, from, tag, attachments }) {
  const config = getConfig();

  const body = {
    From: from || config.defaultSender,
    To: to,
    Subject: subject,
    TextBody: textBody,
    MessageStream: config.defaultStream,
    TrackOpens: true,
    TrackLinks: "HtmlAndText",
  };

  if (htmlBody) body.HtmlBody = htmlBody;
  if (tag) body.Tag = tag;

  if (attachments?.length) {
    const MIME_TYPES = {
      ".csv": "text/csv", ".txt": "text/plain", ".json": "application/json",
      ".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg", ".gif": "image/gif", ".html": "text/html",
      ".xml": "application/xml", ".zip": "application/zip", ".md": "text/markdown",
    };

    body.Attachments = attachments.map((att) => {
      const filePath = typeof att === "string" ? att : att.filePath;
      const content = fs.readFileSync(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const name = att.fileName || path.basename(filePath);
      return {
        Name: name,
        Content: content.toString("base64"),
        ContentType: MIME_TYPES[ext] || "application/octet-stream",
      };
    });
  }

  const result = await postmarkFetch("/email", { method: "POST", body });
  return {
    messageId: result.MessageID,
    to: result.To,
    submittedAt: result.SubmittedAt,
  };
}

export async function sendEmailWithTemplate({ to, templateId, templateAlias, templateModel, from, tag }) {
  const config = getConfig();

  if (!templateId && !templateAlias) {
    throw new Error("Either templateId or templateAlias is required");
  }

  const body = {
    From: from || config.defaultSender,
    To: to,
    TemplateModel: templateModel || {},
    MessageStream: config.defaultStream,
    TrackOpens: true,
    TrackLinks: "HtmlAndText",
  };

  if (templateId) body.TemplateId = templateId;
  else body.TemplateAlias = templateAlias;
  if (tag) body.Tag = tag;

  const result = await postmarkFetch("/email/withTemplate", { method: "POST", body });
  return {
    messageId: result.MessageID,
    to: result.To,
    submittedAt: result.SubmittedAt,
  };
}

export async function listTemplates() {
  const data = await postmarkFetch("/templates?count=100&offset=0");
  return data.Templates.map((t) => ({
    id: t.TemplateId,
    name: t.Name,
    alias: t.Alias || null,
    subject: t.Subject || null,
    active: t.Active,
  }));
}

export async function getDeliveryStats({ tag, fromDate, toDate } = {}) {
  const params = [];
  if (fromDate) params.push(`fromdate=${encodeURIComponent(fromDate)}`);
  if (toDate) params.push(`todate=${encodeURIComponent(toDate)}`);
  if (tag) params.push(`tag=${encodeURIComponent(tag)}`);

  const qs = params.length ? `?${params.join("&")}` : "";
  const data = await postmarkFetch(`/stats/outbound${qs}`);

  const sent = data.Sent || 0;
  const tracked = data.Tracked || 0;
  const uniqueOpens = data.UniqueOpens || 0;
  const totalLinks = data.TotalTrackedLinksSent || 0;
  const uniqueClicks = data.UniqueLinksClicked || 0;

  return {
    sent,
    tracked,
    uniqueOpens,
    openRate: tracked > 0 ? ((uniqueOpens / tracked) * 100).toFixed(1) : "0.0",
    uniqueClicks,
    totalLinks,
    clickRate: totalLinks > 0 ? ((uniqueClicks / totalLinks) * 100).toFixed(1) : "0.0",
    bounced: data.Bounced || 0,
    spamComplaints: data.SpamComplaints || 0,
  };
}
