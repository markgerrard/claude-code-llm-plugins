/**
 * Fan-out execution — send a prompt to multiple models in parallel.
 * Returns results as they complete.
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { getModel, resolveCompanionPath } from "./models.mjs";

/**
 * Load API keys from known env files so child processes have them.
 */
function loadApiKeys() {
  const extra = {};
  const envFiles = [
    ["ZHIPU_API_KEY", path.join(process.env.HOME || "", ".glm", ".env")],
    ["XAI_API_KEY", path.join(process.env.HOME || "", ".grok", ".env")],
    ["MINIMAX_API_KEY", path.join(process.env.HOME || "", ".minimax", ".env")],
    ["MISTRAL_API_KEY", path.join(process.env.HOME || "", ".vibe", ".env")],
    ["GOOGLE_API_KEY", path.join(process.env.HOME || "", ".banana", ".env")],
  ];
  for (const [key, file] of envFiles) {
    if (process.env[key]) continue;
    try {
      const content = fs.readFileSync(file, "utf8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const idx = trimmed.indexOf("=");
        if (idx > 0 && trimmed.slice(0, idx).trim() === key) {
          extra[key] = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
        }
      }
    } catch { /* file doesn't exist */ }
  }
  return extra;
}

const _apiKeys = loadApiKeys();

/**
 * Call a single model and return the response text.
 * Supports two types:
 *   - "companion" (default): spawn node <companion-script> <command> <prompt>
 *   - "cli": spawn <binary> <cliArgs...> <prompt>
 */
function callModel(modelKey, prompt, timeout = 300_000, options = {}) {
  const def = getModel(modelKey);
  if (!def) {
    return Promise.resolve({
      model: modelKey,
      text: null,
      durationMs: 0,
      error: `Unknown model: ${modelKey}`,
    });
  }

  let cmd, args;

  // Pick the right command — use fullCommand (e.g., "code" for pi agent) when:
  //   --full flag is set, OR command is "review" (reviews need file access)
  const needsFileAccess = options.full || options.review;
  const useCommand = (needsFileAccess && def.fullCommand) ? def.fullCommand : def.command;

  if (def.type === "cli") {
    // Direct CLI binary (e.g., codex exec)
    cmd = def.binary;
    args = [...(def.cliArgs || []), prompt];
  } else {
    // Node companion script (default)
    const companionPath = resolveCompanionPath(modelKey);
    if (!companionPath) {
      return Promise.resolve({
        model: def.name,
        text: null,
        durationMs: 0,
        error: `Plugin not installed for ${def.name}`,
      });
    }
    cmd = "node";
    args = [companionPath, useCommand, prompt];
  }

  const start = Date.now();

  return new Promise((resolve) => {
    const proc = spawn(cmd, args, {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ..._apiKeys },
      timeout,
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk) => { stdout += chunk; });
    proc.stderr.on("data", (chunk) => { stderr += chunk; });

    proc.on("close", (code) => {
      const durationMs = Date.now() - start;
      const text = stdout.trim();

      if (code !== 0 && !text) {
        resolve({
          model: def.name,
          text: null,
          durationMs,
          error: stderr.trim() || `Exit code ${code}`,
        });
      } else {
        resolve({
          model: def.name,
          text: text || "(no response)",
          durationMs,
          error: null,
        });
      }
    });

    proc.on("error", (err) => {
      resolve({
        model: def.name,
        text: null,
        durationMs: Date.now() - start,
        error: err.message,
      });
    });
  });
}

/**
 * Fan out a prompt to multiple models in parallel.
 * @param {string[]} modelKeys - Array of model keys
 * @param {string} prompt - The prompt to send
 * @param {number} timeout - Per-model timeout in ms
 * @returns {Promise<Array<{model, text, durationMs, error}>>}
 */
export async function fanOut(modelKeys, prompt, timeout = 300_000, options = {}) {
  const promises = modelKeys.map((key) => callModel(key, prompt, timeout, options));
  return Promise.all(promises);
}
