/**
 * Output rendering — formats Python ACP JSON responses for Claude-facing presentation.
 */

/**
 * Format elapsed time between two ISO date strings (or start to now).
 * Returns a human-readable string like "3m 12s" or null if unparseable.
 *
 * @param {string|null} startStr
 * @param {string|null} [endStr]
 * @returns {string|null}
 */
export function formatElapsed(startStr, endStr = null) {
  const start = Date.parse(startStr ?? "");
  if (!Number.isFinite(start)) return null;
  const end = endStr ? Date.parse(endStr) : Date.now();
  if (!Number.isFinite(end) || end < start) return null;

  const totalSeconds = Math.max(0, Math.round((end - start) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

/**
 * Render a successful or failed result from a foreground Gemini call.
 *
 * @param {object} data  Parsed Python JSON (data field from bridge response)
 * @returns {string}
 */
export function renderResult(data) {
  if (!data.ok) return renderError(data);

  const lines = [];
  if (data.text) {
    lines.push(data.text);
  }

  const meta = [];
  if (data.model) meta.push(`Model: ${data.model}`);
  if (data.tokens != null) meta.push(`Tokens: ${data.tokens}`);
  if (data.duration != null) meta.push(`Duration: ${data.duration}`);
  if (data.start_time && !data.duration) {
    const elapsed = formatElapsed(data.start_time, data.end_time ?? null);
    if (elapsed) meta.push(`Elapsed: ${elapsed}`);
  }
  if (meta.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push(`_${meta.join(" | ")}_`);
  }

  return lines.join("\n");
}

/**
 * Render an error response from Python.
 *
 * @param {object} data
 * @returns {string}
 */
export function renderError(data) {
  const message = data.error ?? "Unknown error";
  const code = data.error_code ? ` \`${data.error_code}\`` : "";
  return `**Error${code}:** ${message}`;
}

/**
 * Render a background job launch confirmation.
 *
 * @param {object} data
 * @returns {string}
 */
export function renderBackgroundLaunch(data) {
  const lines = ["## Gemini job started", ""];
  if (data.job_id) lines.push(`**Job ID:** \`${data.job_id}\``);
  if (data.pid) lines.push(`**PID:** ${data.pid}`);
  if (data.command) lines.push(`**Command:** ${data.command}`);
  lines.push("");
  lines.push("**Commands:**");
  const jobArg = data.job_id ? ` ${data.job_id}` : "";
  lines.push(`- Check status: \`/gemini:status${jobArg}\``);
  lines.push(`- Get result:   \`/gemini:result${jobArg}\``);
  lines.push(`- Cancel:       \`/gemini:cancel${jobArg}\``);
  return lines.join("\n");
}

/**
 * Render a list of jobs from a status response.
 *
 * @param {object} data  Python JSON with a jobs array
 * @returns {string}
 */
export function renderStatusList(data) {
  if (!data.ok) return renderError(data);

  const jobs = data.jobs ?? [];
  if (jobs.length === 0) {
    return "No Gemini jobs found.";
  }

  const lines = ["## Gemini Jobs", ""];
  for (const job of jobs) {
    const elapsed = formatElapsed(job.started_at ?? job.created_at, job.completed_at ?? null);
    const elapsedStr = elapsed ? ` (${elapsed})` : "";
    lines.push(`- **${job.id}** — ${job.status}${elapsedStr}`);
    if (job.command) lines.push(`  Command: ${job.command}`);
  }
  return lines.join("\n");
}

/**
 * Render detailed status for a single job.
 *
 * @param {object} data  Python JSON for a single job
 * @returns {string}
 */
export function renderSingleJobStatus(data) {
  if (!data.ok) return renderError(data);

  const job = data.job ?? data;
  const lines = ["## Gemini Job Status", ""];

  if (job.id) lines.push(`**ID:** \`${job.id}\``);
  if (job.command) lines.push(`**Command:** ${job.command}`);
  if (job.status) lines.push(`**Status:** ${job.status}`);
  if (job.model) lines.push(`**Model:** ${job.model}`);
  if (job.cwd) lines.push(`**CWD:** ${job.cwd}`);

  if (job.created_at) lines.push(`**Created:** ${job.created_at}`);
  if (job.started_at) lines.push(`**Started:** ${job.started_at}`);
  if (job.completed_at) {
    lines.push(`**Completed:** ${job.completed_at}`);
    const elapsed = formatElapsed(job.started_at ?? job.created_at, job.completed_at);
    if (elapsed) lines.push(`**Duration:** ${elapsed}`);
  } else if (job.started_at || job.created_at) {
    const elapsed = formatElapsed(job.started_at ?? job.created_at);
    if (elapsed) lines.push(`**Elapsed:** ${elapsed}`);
  }

  if (job.pid) lines.push(`**PID:** ${job.pid}`);
  if (job.error) lines.push(`**Error:** ${job.error}`);

  return lines.join("\n");
}

/**
 * Render the result of a setup/version check.
 *
 * @param {object} data  Python JSON from a setup/version call
 * @returns {string}
 */
export function renderSetup(data) {
  if (!data.ok) {
    const lines = [];
    if (data.error) lines.push(`**Error:** ${data.error}`);
    if (data.errors?.length) {
      for (const err of data.errors) lines.push(`- ${err}`);
    }
    lines.push("");
    lines.push("**Install instructions:**");
    lines.push("- Install the Gemini CLI: `pip install gemini-cli` or see the project README");
    lines.push("- Ensure `GEMINI_API_KEY` is set in your environment");
    return lines.join("\n");
  }

  const lines = [];
  if (data.version) lines.push(`**Gemini CLI version:** ${data.version}`);
  lines.push("");

  const commands = data.commands ?? data.available_commands;
  if (commands?.length) {
    lines.push("**Available commands:**");
    for (const cmd of commands) {
      lines.push(`- \`${cmd}\``);
    }
  }

  return lines.join("\n");
}
