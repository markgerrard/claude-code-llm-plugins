#!/usr/bin/env node

/**
 * compare-companion.mjs — Multi-model compare/consensus plugin.
 *
 * Subcommands:
 *   compare    Fan out to multiple models, show responses side-by-side
 *   consensus  Fan out, then synthesise agreement/disagreement summary
 *   models     List available models
 */

import process from "node:process";
import { spawnSync } from "node:child_process";
import { fanOut } from "./lib/fanout.mjs";
import { parseModelList, listModels, getModel, DEFAULT_MODELS } from "./lib/models.mjs";

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

// ─── Render ─────────────────────────────────────────────────────────

function renderCompare(results, prompt) {
  const lines = [
    `## Multi-Model Compare`,
    "",
    `**Prompt:** ${prompt.length > 100 ? prompt.slice(0, 100) + "..." : prompt}`,
    `**Models:** ${results.map((r) => r.model).join(", ")}`,
    "",
  ];

  for (const r of results) {
    const duration = (r.durationMs / 1000).toFixed(1);
    lines.push(`### ${r.model} (${duration}s)`);
    lines.push("");
    if (r.error) {
      lines.push(`*Error: ${r.error}*`);
    } else {
      lines.push(r.text);
    }
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  return lines.join("\n");
}

function renderConsensus(results, prompt) {
  const successful = results.filter((r) => !r.error);
  const failed = results.filter((r) => r.error);

  const lines = [
    `## Multi-Model Consensus`,
    "",
    `**Prompt:** ${prompt.length > 100 ? prompt.slice(0, 100) + "..." : prompt}`,
    `**Models queried:** ${results.map((r) => r.model).join(", ")}`,
    `**Responses received:** ${successful.length}/${results.length}`,
    "",
  ];

  if (failed.length) {
    lines.push(`*Failed: ${failed.map((r) => `${r.model} (${r.error})`).join(", ")}*`);
    lines.push("");
  }

  // Individual responses (collapsed)
  lines.push("### Individual Responses");
  lines.push("");

  for (const r of successful) {
    const duration = (r.durationMs / 1000).toFixed(1);
    lines.push(`**${r.model}** (${duration}s):`);
    lines.push(r.text);
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push("### Synthesis");
  lines.push("");
  lines.push("*Compare the responses above. Look for:*");
  lines.push("- **Agreement** — points all models converge on (high confidence)");
  lines.push("- **Divergence** — where models disagree (needs investigation)");
  lines.push("- **Unique insights** — points only one model raised (worth considering)");
  lines.push("");

  return lines.join("\n");
}

function renderModels() {
  const keys = listModels();
  const lines = [
    "Available models for compare/consensus:",
    "",
    `Default set: ${DEFAULT_MODELS.join(", ")}`,
    "",
  ];

  for (const key of keys) {
    const def = getModel(key);
    lines.push(`- **${key}** → ${def.name} (/${def.plugin}:${def.command})`);
  }

  lines.push("");
  lines.push("Override with: --models gemini,grok,glm");

  return lines.join("\n");
}

// ─── Commands ───────────────────────────────────────────────────────

async function cmdCompare(flags, positional) {
  const prompt = positional.join(" ");
  if (!prompt) {
    console.error("Error: prompt required\nUsage: /compare <prompt> [--models gemini,grok,glm]");
    process.exit(1);
  }

  const models = parseModelList(flags.models);
  console.error(`[compare] Querying ${models.length} models in parallel: ${models.join(", ")}...`);

  const results = await fanOut(models, prompt);
  console.log(renderCompare(results, prompt));
}

async function cmdConsensus(flags, positional) {
  const prompt = positional.join(" ");
  if (!prompt) {
    console.error("Error: prompt required\nUsage: /consensus <prompt> [--models gemini,grok,glm]");
    process.exit(1);
  }

  const models = parseModelList(flags.models);
  console.error(`[consensus] Querying ${models.length} models in parallel: ${models.join(", ")}...`);

  const results = await fanOut(models, prompt);
  console.log(renderConsensus(results, prompt));
}

async function cmdReview(flags, positional) {
  const focus = positional.join(" ") || "general code review";
  const base = flags.base || "HEAD";
  const scope = flags.scope || "auto";

  // Get git diff
  const diffArgs = ["diff"];
  if (scope === "branch") {
    diffArgs.push(`${base}...HEAD`);
  } else if (scope === "working-tree") {
    // unstaged only
  } else {
    diffArgs.push(base);
  }

  const diffResult = spawnSync("git", diffArgs, {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    timeout: 30_000,
  });

  const diff = diffResult.stdout?.trim();
  if (!diff) {
    console.log("No changes found to review.");
    process.exit(0);
  }

  const models = parseModelList(flags.models);
  const prompt =
    `You are an expert code reviewer. Review the following git diff.\n\n` +
    `Focus: ${focus}\n\n` +
    `Provide:\n` +
    `1. **Critical issues** — bugs, security problems, data loss risks\n` +
    `2. **Important suggestions** — performance, maintainability, best practices\n` +
    `3. **Minor notes** — style, naming, documentation\n\n` +
    `Be specific: reference file names and line numbers.\n\n` +
    `--- GIT DIFF ---\n${diff}`;

  console.error(`[review] Sending diff (${diff.split("\n").length} lines) to ${models.length} models: ${models.join(", ")}...`);

  const results = await fanOut(models, prompt);
  console.log(renderReview(results, focus, diff));
}

function renderReview(results, focus, diff) {
  const successful = results.filter((r) => !r.error);
  const failed = results.filter((r) => r.error);
  const diffLines = diff.split("\n").length;

  const lines = [
    `## Multi-Model Code Review`,
    "",
    `**Focus:** ${focus}`,
    `**Diff:** ${diffLines} lines`,
    `**Models:** ${results.map((r) => r.model).join(", ")}`,
    `**Responses:** ${successful.length}/${results.length}`,
    "",
  ];

  if (failed.length) {
    lines.push(`*Failed: ${failed.map((r) => `${r.model} (${r.error})`).join(", ")}*`);
    lines.push("");
  }

  // Individual reviews
  for (const r of successful) {
    const duration = (r.durationMs / 1000).toFixed(1);
    lines.push(`### ${r.model} (${duration}s)`);
    lines.push("");
    lines.push(r.text);
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  // Consensus synthesis
  lines.push("### Consensus Synthesis");
  lines.push("");
  lines.push("*Review the individual assessments above. Key questions:*");
  lines.push("- **Critical issues** — which issues did multiple reviewers flag? (high confidence)");
  lines.push("- **Contradictions** — where do reviewers disagree? (investigate)");
  lines.push("- **Unique finds** — important issues only one reviewer caught (worth checking)");
  lines.push("- **Overall verdict** — is this diff safe to merge?");
  lines.push("");

  return lines.join("\n");
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
  const rawArgs = process.argv.slice(2);
  if (rawArgs.length === 0) {
    console.log(
      "Usage:\n" +
      "  compare-companion.mjs compare <prompt> [--models m1,m2,...]\n" +
      "  compare-companion.mjs consensus <prompt> [--models m1,m2,...]\n" +
      "  compare-companion.mjs models"
    );
    process.exit(0);
  }

  const subcommand = rawArgs[0];
  const { flags, positional } = parseArgs(rawArgs.slice(1));

  switch (subcommand) {
    case "compare":   await cmdCompare(flags, positional); break;
    case "consensus": await cmdConsensus(flags, positional); break;
    case "review":    await cmdReview(flags, positional); break;
    case "models":    console.log(renderModels()); break;
    default:
      console.error(`Unknown subcommand: ${subcommand}`);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
