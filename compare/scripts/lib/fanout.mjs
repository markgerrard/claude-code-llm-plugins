/**
 * Fan-out execution — send a prompt to multiple models in parallel.
 * Returns results as they complete.
 */

import { spawn } from "node:child_process";
import { getModel, resolveCompanionPath } from "./models.mjs";

/**
 * Call a single model's companion script and return the response text.
 * @param {string} modelKey - Model key (e.g., "gemini", "grok")
 * @param {string} prompt - The prompt to send
 * @param {number} timeout - Timeout in ms
 * @returns {Promise<{model: string, text: string, durationMs: number, error: string|null}>}
 */
function callModel(modelKey, prompt, timeout = 300_000) {
  const def = getModel(modelKey);
  if (!def) {
    return Promise.resolve({
      model: modelKey,
      text: null,
      durationMs: 0,
      error: `Unknown model: ${modelKey}`,
    });
  }

  const companionPath = resolveCompanionPath(modelKey);
  if (!companionPath) {
    return Promise.resolve({
      model: def.name,
      text: null,
      durationMs: 0,
      error: `Plugin not installed for ${def.name}`,
    });
  }

  const start = Date.now();

  return new Promise((resolve) => {
    const proc = spawn("node", [companionPath, def.command, prompt], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
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
export async function fanOut(modelKeys, prompt, timeout = 300_000) {
  const promises = modelKeys.map((key) => callModel(key, prompt, timeout));
  return Promise.all(promises);
}
