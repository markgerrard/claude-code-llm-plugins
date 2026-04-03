import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GEMINI_ACP_PATH = path.resolve(__dirname, "..", "gemini-acp.py");

function tryParseJson(str) {
  try { return JSON.parse(str); } catch { return null; }
}

/**
 * Separate flags (--key value) from the prompt text in an args array.
 * The first arg that doesn't start with "--" and isn't a flag value is the prompt.
 * This allows passing multiline prompts via stdin instead of as spawn args.
 */
function splitPromptFromArgs(args) {
  const flags = [];
  let prompt = null;
  let i = 0;
  while (i < args.length) {
    if (args[i].startsWith("--")) {
      flags.push(args[i]);
      // Check if next arg is the flag's value (not another flag, not the last arg)
      if (i + 1 < args.length && !args[i + 1].startsWith("--")) {
        flags.push(args[i + 1]);
        i += 2;
      } else {
        i++;
      }
    } else {
      // First non-flag arg is the prompt (may contain newlines)
      prompt = args.slice(i).join(" ");
      break;
    }
  }
  return { flags, prompt };
}

export async function callGeminiAcp(subcommand, args = [], options = {}) {
  const cwd = options.cwd || process.cwd();

  // Separate flags from the prompt — prompt may contain newlines which spawn rejects.
  // Pass the prompt via stdin using --stdin-prompt flag.
  const { flags, prompt } = splitPromptFromArgs(args);

  return new Promise((resolve) => {
    const spawnArgs = [GEMINI_ACP_PATH, subcommand, ...flags];
    if (prompt) spawnArgs.push("--stdin-prompt");

    const proc = spawn("python3", spawnArgs, {
      cwd,
      stdio: [prompt ? "pipe" : "ignore", "pipe", "pipe"],
      env: { ...process.env, ...options.env },
      timeout: options.timeout || 600_000,
    });

    if (prompt) {
      proc.stdin.write(prompt);
      proc.stdin.end();
    }

    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (chunk) => { stdout += chunk; });
    proc.stderr.on("data", (chunk) => { stderr += chunk; });
    proc.on("close", (code) => {
      const data = tryParseJson(stdout.trim());
      resolve({
        ok: data?.ok ?? false,
        data: data || { ok: false, error: stdout.trim() || "Unknown error", error_code: "parse_error" },
        exitCode: code ?? 1,
        stderr: stderr.trim(),
      });
    });
    proc.on("error", (err) => {
      resolve({
        ok: false,
        data: { ok: false, error: err.message, error_code: "spawn_error" },
        exitCode: 1,
        stderr: err.message,
      });
    });
  });
}

export async function* streamGeminiAcp(subcommand, args = [], options = {}) {
  const cwd = options.cwd || process.cwd();
  const { flags, prompt } = splitPromptFromArgs(args);
  const spawnArgs = [GEMINI_ACP_PATH, subcommand, "--stream", ...flags];
  if (prompt) spawnArgs.push("--stdin-prompt");

  const proc = spawn("python3", spawnArgs, {
    cwd,
    stdio: [prompt ? "pipe" : "ignore", "pipe", "pipe"],
    env: { ...process.env, ...options.env },
    timeout: options.timeout || 600_000,
  });

  if (prompt) {
    proc.stdin.write(prompt);
    proc.stdin.end();
  }
  let buffer = "";
  proc.stderr.on("data", () => {}); // drain stderr

  const lines = (async function* () {
    for await (const chunk of proc.stdout) {
      buffer += chunk.toString();
      let idx;
      while ((idx = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (line) yield line;
      }
    }
    const rest = buffer.trim();
    if (rest) yield rest;
  })();

  for await (const line of lines) {
    const parsed = tryParseJson(line);
    if (parsed) {
      yield parsed;
      if (parsed.terminal) break;
    }
  }
}
