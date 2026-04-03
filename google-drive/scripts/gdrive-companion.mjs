#!/usr/bin/env node

/**
 * gdrive-companion.mjs — Google Drive plugin entry point.
 *
 * Subcommands:
 *   setup       Check config and connectivity
 *   auth        Run OAuth flow (interactive)
 *   list        List files in Drive
 *   search      Search files by name/content
 *   upload      Upload a local file
 *   download    Download a Drive file locally
 *   mkdir       Create a folder
 *   trash       Move a file/folder to trash
 */

import process from "node:process";
import {
  checkConfig,
  verifyConnection,
  listFiles,
  searchFiles,
  uploadFile,
  downloadFile,
  createFolder,
  deleteFile,
} from "./lib/gdrive.mjs";

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

  if (!config.hasClientId || !config.hasClientSecret) {
    console.log(
      "Google Drive — not configured.\n\n" +
      "Set these in ~/.gdrive/.env or your environment:\n" +
      "  GOOGLE_CLIENT_ID=your-client-id\n" +
      "  GOOGLE_CLIENT_SECRET=your-client-secret\n\n" +
      "Then run /gdrive:auth to authenticate.\n\n" +
      "Create OAuth credentials at https://console.cloud.google.com/apis/credentials"
    );
    process.exit(1);
  }

  if (!config.hasToken) {
    console.log(
      "Google Drive — credentials set but not authenticated.\n\n" +
      "Run /gdrive:auth to complete OAuth flow."
    );
    process.exit(1);
  }

  const conn = await verifyConnection();
  if (!conn.ok) {
    console.log(`Google Drive — connection failed.\n\nError: ${conn.error}`);
    process.exit(1);
  }

  console.log(
    `Google Drive — connected as ${conn.name} (${conn.email}).\n\n` +
    "Available commands:\n" +
    "  /gdrive:list [--folder <id>]              — List files\n" +
    "  /gdrive:search <query>                    — Search files\n" +
    "  /gdrive:upload <local-path> [--folder <id>] — Upload a file\n" +
    "  /gdrive:download <file-id> <save-path>    — Download a file\n" +
    "  /gdrive:mkdir <name> [--parent <id>]      — Create a folder\n" +
    "  /gdrive:trash <file-id>                   — Trash a file/folder"
  );
}

async function cmdAuth(flags) {
  // Import auth module dynamically
  const { dirname, join } = await import("path");
  const { fileURLToPath } = await import("url");
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const authPath = join(__dirname, "auth.mjs");

  console.log(
    "Starting Google Drive OAuth flow...\n" +
    "Run this command in your terminal (not via Claude):\n\n" +
    `  node ${authPath}` + (flags.manual ? " --manual" : "") + "\n\n" +
    "This requires browser access for the OAuth consent screen."
  );
}

async function cmdList(flags) {
  try {
    const files = await listFiles({
      folderId: flags.folder || flags.parent || undefined,
      pageSize: flags.limit ? parseInt(flags.limit, 10) : undefined,
    });

    if (files.length === 0) {
      console.log("No files found.");
      return;
    }

    const lines = [`Found ${files.length} files:`, ""];
    for (const f of files) {
      const size = f.size ? ` (${formatSize(parseInt(f.size, 10))})` : "";
      const modified = f.modifiedTime ? ` — ${f.modifiedTime.slice(0, 10)}` : "";
      lines.push(`- **${f.name}**${size}${modified}`);
      lines.push(`  ID: ${f.id}`);
      if (f.webViewLink) lines.push(`  Link: ${f.webViewLink}`);
    }
    console.log(lines.join("\n"));
  } catch (err) {
    console.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

async function cmdSearch(flags, positional) {
  const query = positional.join(" ") || flags.query;
  if (!query) {
    console.error("Error: search query required");
    process.exit(1);
  }

  try {
    const files = await searchFiles({
      query,
      pageSize: flags.limit ? parseInt(flags.limit, 10) : undefined,
    });

    if (files.length === 0) {
      console.log(`No files matching "${query}".`);
      return;
    }

    const lines = [`Found ${files.length} files matching "${query}":`, ""];
    for (const f of files) {
      const size = f.size ? ` (${formatSize(parseInt(f.size, 10))})` : "";
      lines.push(`- **${f.name}**${size}`);
      lines.push(`  ID: ${f.id}`);
    }
    console.log(lines.join("\n"));
  } catch (err) {
    console.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

async function cmdUpload(flags, positional) {
  const localPath = positional[0] || flags.file;
  if (!localPath) {
    console.error("Error: local file path required");
    process.exit(1);
  }

  try {
    const result = await uploadFile({
      localPath,
      name: flags.name || undefined,
      folderId: flags.folder || flags.parent || undefined,
    });

    console.log(
      `Uploaded.\n` +
      `  Name: ${result.name}\n` +
      `  ID: ${result.id}\n` +
      `  Link: ${result.webViewLink || "n/a"}`
    );
  } catch (err) {
    console.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

async function cmdDownload(flags, positional) {
  const fileId = positional[0] || flags.id;
  const savePath = positional[1] || flags.save || flags.output;

  if (!fileId) {
    console.error("Error: file ID required");
    process.exit(1);
  }
  if (!savePath) {
    console.error("Error: save path required");
    process.exit(1);
  }

  try {
    const result = await downloadFile({ fileId, savePath });
    console.log(`Downloaded "${result.name}" to ${result.path}`);
  } catch (err) {
    console.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

async function cmdMkdir(flags, positional) {
  const name = positional[0] || flags.name;
  if (!name) {
    console.error("Error: folder name required");
    process.exit(1);
  }

  try {
    const result = await createFolder({
      name,
      parentId: flags.parent || undefined,
    });

    console.log(
      `Folder created.\n` +
      `  Name: ${result.name}\n` +
      `  ID: ${result.id}\n` +
      `  Link: ${result.webViewLink || "n/a"}`
    );
  } catch (err) {
    console.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

async function cmdTrash(flags, positional) {
  const fileId = positional[0] || flags.id;
  if (!fileId) {
    console.error("Error: file ID required");
    process.exit(1);
  }

  try {
    const result = await deleteFile({ fileId });
    console.log(`Trashed "${result.name}" (${result.id})`);
  } catch (err) {
    console.error(`Failed: ${err.message}`);
    process.exit(1);
  }
}

// ─── Helpers ────────────────────────────────────────────────────────

function formatSize(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
  const rawArgs = process.argv.slice(2);
  if (rawArgs.length === 0) {
    console.log(
      "Usage:\n" +
      "  gdrive-companion.mjs setup\n" +
      "  gdrive-companion.mjs auth [--manual]\n" +
      "  gdrive-companion.mjs list [--folder <id>] [--limit <n>]\n" +
      "  gdrive-companion.mjs search <query>\n" +
      "  gdrive-companion.mjs upload <local-path> [--folder <id>] [--name <name>]\n" +
      "  gdrive-companion.mjs download <file-id> <save-path>\n" +
      "  gdrive-companion.mjs mkdir <name> [--parent <id>]\n" +
      "  gdrive-companion.mjs trash <file-id>"
    );
    process.exit(0);
  }

  const subcommand = rawArgs[0];
  const { flags, positional } = parseArgs(rawArgs.slice(1));

  switch (subcommand) {
    case "setup":    await cmdSetup(); break;
    case "auth":     await cmdAuth(flags); break;
    case "list":     await cmdList(flags); break;
    case "search":   await cmdSearch(flags, positional); break;
    case "upload":   await cmdUpload(flags, positional); break;
    case "download": await cmdDownload(flags, positional); break;
    case "mkdir":    await cmdMkdir(flags, positional); break;
    case "trash":    await cmdTrash(flags, positional); break;
    default:
      console.error(`Unknown subcommand: ${subcommand}`);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
