#!/usr/bin/env node

/**
 * postmark-companion.mjs — Postmark plugin entry point.
 *
 * Subcommands:
 *   setup          Check Postmark config and connectivity
 *   send           Send an email
 *   template-send  Send an email using a Postmark template
 *   templates      List available templates
 *   stats          Show delivery statistics
 */

import process from "node:process";
import {
  checkConfig,
  verifyConnection,
  sendEmail,
  sendEmailWithTemplate,
  listTemplates,
  getDeliveryStats,
} from "./lib/postmark.mjs";

// ─── Arg parsing ────────────────────────────────────────────────────

function parseArgs(rawArgs) {
  const flags = {};
  const positional = [];
  let i = 0;
  while (i < rawArgs.length) {
    if (rawArgs[i].startsWith("--")) {
      const key = rawArgs[i].slice(2);
      if (i + 1 < rawArgs.length && !rawArgs[i + 1].startsWith("--")) {
        flags[key] = rawArgs[i + 1];
        i += 2;
      } else {
        flags[key] = true;
        i++;
      }
    } else {
      positional.push(rawArgs[i]);
      i++;
    }
  }
  return { flags, positional };
}

// ─── Commands ───────────────────────────────────────────────────────

async function cmdSetup() {
  const config = checkConfig();

  if (!config.hasToken) {
    console.log(
      "Postmark — not configured.\n\n" +
      "Set these variables in ~/.postmark/.env or your environment:\n" +
      "  POSTMARK_SERVER_TOKEN=your-token\n" +
      "  DEFAULT_SENDER_EMAIL=you@example.com\n" +
      "  DEFAULT_MESSAGE_STREAM=outbound\n\n" +
      "Get your server token at https://account.postmarkapp.com/servers"
    );
    process.exit(1);
  }

  const conn = await verifyConnection();
  if (!conn.ok) {
    console.log(`Postmark — connection failed.\n\nError: ${conn.error}`);
    process.exit(1);
  }

  const lines = [
    `Postmark — connected to "${conn.serverName}".`,
    "",
    `  Sender: ${config.defaultSender}`,
    `  Stream: ${config.defaultStream}`,
    `  Token:  ${config.tokenPreview}`,
    "",
    "Available commands:",
    "  /postmark:send <to> <subject>          — Send an email",
    "  /postmark:template-send <to> <template> — Send using a template",
    "  /postmark:templates                     — List templates",
    "  /postmark:stats                         — Delivery statistics",
  ];
  console.log(lines.join("\n"));
}

async function cmdSend(flags, positional) {
  const to = flags.to || positional[0];
  const subject = flags.subject || positional[1];
  const body = flags.body || positional.slice(2).join(" ");

  if (!to) {
    console.error("Error: --to <email> is required");
    process.exit(1);
  }
  if (!subject) {
    console.error("Error: --subject <text> is required");
    process.exit(1);
  }
  if (!body) {
    console.error("Error: message body is required (--body or positional args after subject)");
    process.exit(1);
  }

  // Parse attachments
  const attachments = [];
  if (flags.attach) {
    const files = Array.isArray(flags.attach) ? flags.attach : [flags.attach];
    attachments.push(...files.map((f) => ({ filePath: f })));
  }

  try {
    const result = await sendEmail({
      to,
      subject,
      textBody: body,
      htmlBody: flags.html || null,
      from: flags.from || null,
      tag: flags.tag || null,
      attachments: attachments.length ? attachments : undefined,
    });

    console.log(
      `Email sent.\n` +
      `  To: ${result.to}\n` +
      `  MessageID: ${result.messageId}\n` +
      `  Submitted: ${result.submittedAt}`
    );
  } catch (err) {
    console.error(`Failed to send: ${err.message}`);
    process.exit(1);
  }
}

async function cmdTemplateSend(flags, positional) {
  const to = flags.to || positional[0];
  const template = flags.template || flags["template-id"] || flags["template-alias"] || positional[1];

  if (!to) {
    console.error("Error: --to <email> is required");
    process.exit(1);
  }
  if (!template) {
    console.error("Error: --template <id-or-alias> is required");
    process.exit(1);
  }

  // Parse template model from --var key=value flags
  const model = {};
  if (flags.var) {
    const vars = Array.isArray(flags.var) ? flags.var : [flags.var];
    for (const v of vars) {
      const idx = v.indexOf("=");
      if (idx > 0) {
        model[v.slice(0, idx)] = v.slice(idx + 1);
      }
    }
  }

  const isNumeric = /^\d+$/.test(template);

  try {
    const result = await sendEmailWithTemplate({
      to,
      templateId: isNumeric ? parseInt(template, 10) : undefined,
      templateAlias: isNumeric ? undefined : template,
      templateModel: model,
      from: flags.from || null,
      tag: flags.tag || null,
    });

    console.log(
      `Template email sent.\n` +
      `  To: ${result.to}\n` +
      `  Template: ${template}\n` +
      `  MessageID: ${result.messageId}`
    );
  } catch (err) {
    console.error(`Failed to send: ${err.message}`);
    process.exit(1);
  }
}

async function cmdTemplates() {
  try {
    const templates = await listTemplates();
    if (templates.length === 0) {
      console.log("No templates found.");
      return;
    }

    const lines = [`Found ${templates.length} templates:`, ""];
    for (const t of templates) {
      lines.push(`- **${t.name}** (ID: ${t.id}${t.alias ? `, alias: ${t.alias}` : ""})`);
      if (t.subject) lines.push(`  Subject: ${t.subject}`);
    }
    console.log(lines.join("\n"));
  } catch (err) {
    console.error(`Failed to list templates: ${err.message}`);
    process.exit(1);
  }
}

async function cmdStats(flags) {
  try {
    const stats = await getDeliveryStats({
      tag: flags.tag || undefined,
      fromDate: flags.from || flags["from-date"] || undefined,
      toDate: flags.to || flags["to-date"] || undefined,
    });

    const lines = [
      "Email Delivery Stats",
      "",
      `  Sent:            ${stats.sent}`,
      `  Open rate:       ${stats.openRate}% (${stats.uniqueOpens}/${stats.tracked})`,
      `  Click rate:      ${stats.clickRate}% (${stats.uniqueClicks}/${stats.totalLinks})`,
      `  Bounced:         ${stats.bounced}`,
      `  Spam complaints: ${stats.spamComplaints}`,
    ];
    if (flags.tag) lines.push(`  Tag: ${flags.tag}`);
    if (flags["from-date"] || flags["to-date"]) {
      lines.push(`  Period: ${flags["from-date"] || "start"} to ${flags["to-date"] || "now"}`);
    }
    console.log(lines.join("\n"));
  } catch (err) {
    console.error(`Failed to get stats: ${err.message}`);
    process.exit(1);
  }
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
  const rawArgs = process.argv.slice(2);
  if (rawArgs.length === 0) {
    console.log(
      "Usage:\n" +
      "  postmark-companion.mjs setup\n" +
      "  postmark-companion.mjs send --to <email> --subject <text> --body <text>\n" +
      "  postmark-companion.mjs template-send --to <email> --template <id-or-alias>\n" +
      "  postmark-companion.mjs templates\n" +
      "  postmark-companion.mjs stats [--tag <tag>] [--from-date YYYY-MM-DD] [--to-date YYYY-MM-DD]"
    );
    process.exit(0);
  }

  const subcommand = rawArgs[0];
  const { flags, positional } = parseArgs(rawArgs.slice(1));

  switch (subcommand) {
    case "setup":
      await cmdSetup();
      break;
    case "send":
      await cmdSend(flags, positional);
      break;
    case "template-send":
      await cmdTemplateSend(flags, positional);
      break;
    case "templates":
      await cmdTemplates();
      break;
    case "stats":
      await cmdStats(flags);
      break;
    default:
      console.error(`Unknown subcommand: ${subcommand}`);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
