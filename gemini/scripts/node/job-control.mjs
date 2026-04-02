/**
 * Job control — thin wrapper calling Python via the ACP bridge.
 */

import { callGeminiAcp } from "./gemini-acp-bridge.mjs";

export async function getJobStatus(jobId) {
  const args = jobId ? ["--job", jobId] : [];
  return callGeminiAcp("status", args);
}

export async function getJobResult(jobId) {
  const args = jobId ? ["--job", jobId] : [];
  return callGeminiAcp("result", args);
}

export async function cancelJob(jobId) {
  const args = jobId ? ["--job", jobId] : [];
  return callGeminiAcp("cancel", args);
}

export async function getJobLogs(jobId, options = {}) {
  const args = [];
  if (jobId) args.push("--job", jobId);
  if (options.text) args.push("--text");
  return callGeminiAcp("logs", args);
}
