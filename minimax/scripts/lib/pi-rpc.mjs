/**
 * Pi coding agent RPC integration.
 * Spawns Pi in RPC mode and communicates via JSONL on stdin/stdout.
 */

import { spawn } from "node:child_process";

/**
 * Find the Pi CLI entry point.
 */
function findPiCliPath() {
  // Use the globally installed pi command
  return null; // null = use 'pi' from PATH
}

/**
 * Attach a JSONL line reader to a readable stream.
 */
function attachJsonlReader(stream, onLine) {
  let buffer = "";
  const onData = (chunk) => {
    buffer += chunk.toString();
    let newlineIndex;
    while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (line) onLine(line);
    }
  };
  stream.on("data", onData);
  return () => stream.off("data", onData);
}

/**
 * Create a Pi RPC client that spawns and manages a Pi process.
 */
export function createPiClient(options = {}) {
  let proc = null;
  let stopReading = null;
  let requestId = 0;
  const pendingRequests = new Map();
  const eventListeners = [];
  let stderr = "";
  let exitInfo = null; // captures exit if it happens before anyone is listening

  function handleLine(line) {
    try {
      const data = JSON.parse(line);
      if (data.type === "response" && data.id && pendingRequests.has(data.id)) {
        const pending = pendingRequests.get(data.id);
        pendingRequests.delete(data.id);
        pending.resolve(data);
        return;
      }
      for (const listener of eventListeners) {
        listener(data);
      }
    } catch {
      // Ignore non-JSON lines
    }
  }

  function send(command) {
    if (!proc?.stdin) throw new Error("Pi client not started");
    if (exitInfo) throw new Error(`Pi already exited (code ${exitInfo.code}). stderr: ${stderr.slice(-500)}`);
    const id = `req_${++requestId}`;
    const full = { ...command, id };
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingRequests.delete(id);
        reject(new Error(`Timeout waiting for Pi response to ${command.type}`));
      }, 30000);
      pendingRequests.set(id, {
        resolve: (r) => { clearTimeout(timeout); resolve(r); },
        reject: (e) => { clearTimeout(timeout); reject(e); },
      });
      proc.stdin.write(JSON.stringify(full) + "\n");
    });
  }

  function getData(response) {
    if (!response.success) throw new Error(response.error || "Pi RPC error");
    return response.data;
  }

  return {
    async start() {
      if (proc) throw new Error("Already started");

      const args = ["--mode", "rpc", "--no-session"];
      if (options.provider) args.push("--provider", options.provider);
      if (options.model) args.push("--model", options.model);
      if (options.args) args.push(...options.args);

      proc = spawn("pi", args, {
        cwd: options.cwd || process.cwd(),
        env: { ...process.env, ...options.env },
        stdio: ["pipe", "pipe", "pipe"],
      });

      proc.stderr?.on("data", (d) => { stderr += d.toString(); });
      stopReading = attachJsonlReader(proc.stdout, handleLine);

      // Capture exit globally so no event is lost between start() and promptAndWait()
      proc.on("exit", (code) => {
        exitInfo = { code, stderr: stderr.slice(-500) };
        // Reject all pending requests
        for (const [id, pending] of pendingRequests) {
          pending.reject(new Error(`Pi exited (code ${code}). stderr: ${stderr.slice(-500)}`));
        }
        pendingRequests.clear();
      });

      await new Promise((resolve) => setTimeout(resolve, 500));
      if (proc.exitCode !== null) {
        throw new Error(`Pi exited immediately (code ${proc.exitCode}). stderr: ${stderr}`);
      }
    },

    async stop() {
      if (!proc) return;
      stopReading?.();
      proc.kill("SIGTERM");
      await new Promise((resolve) => {
        const t = setTimeout(() => { proc?.kill("SIGKILL"); resolve(); }, 2000);
        proc?.on("exit", () => { clearTimeout(t); resolve(); });
      });
      proc = null;
      pendingRequests.clear();
    },

    onEvent(listener) {
      eventListeners.push(listener);
      return () => {
        const i = eventListeners.indexOf(listener);
        if (i !== -1) eventListeners.splice(i, 1);
      };
    },

    async prompt(message) {
      await send({ type: "prompt", message });
    },

    async setModel(provider, modelId) {
      const r = await send({ type: "set_model", provider, modelId });
      return getData(r);
    },

    async getState() {
      const r = await send({ type: "get_state" });
      return getData(r);
    },

    async abort() {
      await send({ type: "abort" });
    },

    async getLastAssistantText() {
      const r = await send({ type: "get_last_assistant_text" });
      return getData(r).text;
    },

    waitForIdle(timeout = 0) {
      return new Promise((resolve, reject) => {
        // Already exited?
        if (exitInfo) return reject(new Error(`Pi already exited (code ${exitInfo.code}). stderr: ${exitInfo.stderr}`));
        let timer;
        if (timeout > 0) {
          timer = setTimeout(() => { unsub(); reject(new Error("Pi RPC timeout")); }, timeout);
        }
        const unsub = this.onEvent((event) => {
          if (event.type === "agent_end") {
            if (timer) clearTimeout(timer);
            unsub();
            resolve();
          }
        });
      });
    },

    async promptAndWait(message, timeout = 0) {
      // Check if Pi already exited before we even start
      if (exitInfo) {
        throw new Error(`Pi already exited (code ${exitInfo.code}). stderr: ${exitInfo.stderr}`);
      }

      const events = [];
      const done = new Promise((resolve, reject) => {
        let timer;
        if (timeout > 0) {
          timer = setTimeout(() => { unsub(); offExit(); reject(new Error("Pi RPC timeout")); }, timeout);
        }
        const unsub = this.onEvent((event) => {
          events.push(event);
          if (event.type === "agent_end") {
            if (timer) clearTimeout(timer);
            unsub();
            offExit();
            resolve(events);
          }
        });
        // Detect Pi process exit before agent_end
        const onExit = (code) => {
          if (timer) clearTimeout(timer);
          unsub();
          reject(new Error(`Pi exited unexpectedly (code ${code}). stderr: ${stderr.slice(-500)}`));
        };
        proc?.on("exit", onExit);
        const offExit = () => proc?.off("exit", onExit);
      });
      await this.prompt(message);
      return done;
    },

    getExitInfo() { return exitInfo; },
    getStderr() { return stderr; },
  };
}
