/**
 * Katulong helm mode.
 *
 * Instead of rendering Claude Code's TUI in the terminal, this mode:
 * 1. Connects to katulong's helm WebSocket
 * 2. Runs Claude Code via the Agent SDK
 * 3. Streams all conversation events to katulong for browser rendering
 * 4. Receives user input (messages) back from the browser
 *
 * The terminal shows a minimal status line while the browser does the heavy lifting.
 */

import WebSocket from "ws";

/**
 * @param {{ url: string, session: string }} env
 * @param {string[]} args
 */
export async function katulongMode(env, args) {
  const prompt = args.join(" ") || undefined;
  const wsUrl = env.url.replace(/^http/, "ws") + "/ws/helm";

  console.log(`Connecting to katulong at ${env.url}...`);

  const ws = new WebSocket(wsUrl);

  const ready = new Promise((resolve, reject) => {
    ws.on("open", resolve);
    ws.on("error", reject);
  });

  try {
    await ready;
  } catch (err) {
    console.error(`Failed to connect to katulong: ${err.message}`);
    console.error("Falling back to CLI mode.");
    ws.close();
    const { passthrough } = await import("./passthrough.js");
    return passthrough(args);
  }

  console.log("Connected. Interaction has moved to the browser.");
  console.log("Press Ctrl+C to abort.\n");

  // Register this helm session with katulong
  wsSend(ws, {
    type: "helm:start",
    session: env.session,
    agent: "claude-code",
    prompt: prompt || null,
    cwd: process.cwd(),
  });

  // Session state
  let sessionId = null;
  let running = false;

  // Handle messages from katulong (user input from browser)
  ws.on("message", async (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    switch (msg.type) {
      case "helm:registered":
        await runQuery(ws, env, prompt);
        break;

      case "helm:user-message":
        if (!running) {
          await runQuery(ws, env, msg.content, sessionId);
        }
        break;

      case "helm:abort":
        console.log("\nSession aborted from browser.");
        wsSend(ws, { type: "helm:end", session: env.session, result: "aborted" });
        cleanup(ws);
        break;

      case "error":
        console.error(`Katulong error: ${msg.message}`);
        cleanup(ws);
        break;
    }
  });

  ws.on("close", () => {
    console.log("\nDisconnected from katulong.");
    process.exit(0);
  });

  process.on("SIGINT", () => {
    wsSend(ws, { type: "helm:end", session: env.session, result: "aborted" });
    cleanup(ws);
  });

  /**
   * Run a query through the Agent SDK and stream events to katulong.
   */
  async function runQuery(ws, env, userPrompt, resumeSessionId) {
    if (!userPrompt) {
      wsSend(ws, { type: "helm:waiting-for-input", session: env.session });
      console.log("Waiting for input from browser...");
      return;
    }

    running = true;
    console.log(resumeSessionId ? "Continuing..." : "Agent started. Working...");

    let sdk;
    try {
      sdk = await import("@anthropic-ai/claude-agent-sdk");
    } catch {
      console.error("Claude Agent SDK not installed.");
      wsSend(ws, { type: "helm:end", session: env.session, result: "error", error: "Agent SDK not available" });
      cleanup(ws);
      return;
    }

    try {
      const queryOpts = {
        prompt: userPrompt,
        options: {
          permissionMode: "bypassPermissions",
        },
      };
      if (resumeSessionId) {
        queryOpts.options.sessionId = resumeSessionId;
        queryOpts.options.continue = true;
      }

      for await (const event of sdk.query(queryOpts)) {
        // Capture session ID for continuation
        if (event.session_id) sessionId = event.session_id;

        // Relay to katulong
        wsSend(ws, {
          type: "helm:event",
          session: env.session,
          event: sanitize(event),
        });

        // Terminal status
        logStatus(event);
      }

      running = false;
      wsSend(ws, { type: "helm:turn-complete", session: env.session });
      wsSend(ws, { type: "helm:waiting-for-input", session: env.session });
      console.log("\nWaiting for follow-up from browser...");
    } catch (err) {
      running = false;
      console.error(`Agent error: ${err.message}`);
      wsSend(ws, { type: "helm:end", session: env.session, result: "error", error: err.message });
      cleanup(ws);
    }
  }

  // Keep process alive
  await new Promise(() => {});
}

// --- Helpers ---

function logStatus(event) {
  switch (event.type) {
    case "assistant":
      if (event.message?.content) {
        for (const block of event.message.content) {
          if (block.type === "tool_use") process.stdout.write(`[${block.name}] `);
          else if (block.type === "text" && block.text) process.stdout.write(".");
        }
      }
      break;
    case "result":
      console.log(` Done. (${event.duration_ms}ms)`);
      break;
  }
}

function sanitize(event) {
  try {
    return JSON.parse(JSON.stringify(event));
  } catch {
    return { type: event.type || "unknown" };
  }
}

function wsSend(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function cleanup(ws) {
  try { ws.close(); } catch { /* already closed */ }
  setTimeout(() => process.exit(0), 100);
}
