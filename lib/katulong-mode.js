/**
 * Katulong browser mode.
 *
 * Instead of rendering Claude Code's TUI in the terminal, this mode:
 * 1. Connects to katulong's claude session WebSocket
 * 2. Starts a Claude Agent SDK session
 * 3. Streams all conversation events to katulong
 * 4. Katulong relays them to browser clients for native web rendering
 * 5. Receives user input (messages, tool approvals) back from the browser
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
    agent: "yolo",
    prompt: prompt || null,
    cwd: process.cwd(),
  });

  // Track session state
  let agentSession = null;
  let waitingForInput = false;

  // Handle messages from katulong (user input from browser)
  ws.on("message", async (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    switch (msg.type) {
      case "helm:registered":
        // Katulong acknowledged our session — start the agent
        await startAgent(ws, env, prompt);
        break;

      case "helm:user-message":
        // User sent a follow-up message from the browser
        if (agentSession && waitingForInput) {
          waitingForInput = false;
          await continueAgent(ws, env, msg.content);
        }
        break;

      case "helm:tool-response":
        // User approved/denied a tool call from the browser
        if (pendingToolApprovals.has(msg.id)) {
          const resolve = pendingToolApprovals.get(msg.id);
          pendingToolApprovals.delete(msg.id);
          resolve(msg.approved);
        }
        break;

      case "helm:abort":
        console.log("\nSession aborted from browser.");
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

  // Handle Ctrl+C
  process.on("SIGINT", () => {
    wsSend(ws, { type: "helm:end", session: env.session, result: "aborted" });
    cleanup(ws);
  });

  // Keep process alive
  await new Promise(() => {});
}

// --- Agent SDK integration ---

const pendingToolApprovals = new Map();

async function startAgent(ws, env, prompt) {
  let sdk;
  try {
    sdk = await import("@anthropic-ai/claude-agent-sdk");
  } catch (err) {
    console.error("Claude Agent SDK not installed. Install with: npm install -g @anthropic-ai/claude-agent-sdk");
    wsSend(ws, { type: "helm:end", session: env.session, result: "error", error: "Agent SDK not available" });
    cleanup(ws);
    return;
  }

  try {
    await runAgentLoop(sdk, ws, env, prompt);
  } catch (err) {
    console.error(`Agent error: ${err.message}`);
    wsSend(ws, { type: "helm:end", session: env.session, result: "error", error: err.message });
    cleanup(ws);
  }
}

async function runAgentLoop(sdk, ws, env, prompt) {
  if (!prompt) {
    // No initial prompt — wait for user to type in browser
    wsSend(ws, { type: "helm:waiting-for-input", session: env.session });
    console.log("Waiting for input from browser...");
    return;
  }

  const query = sdk.query || sdk.default?.query;
  if (!query) {
    throw new Error("Could not find query() in Agent SDK — check SDK version");
  }

  console.log("Agent started. Working...");

  for await (const message of query({
    prompt,
    options: {
      permissionMode: "bypassPermissions",
    },
  })) {
    // Relay every SDK event to katulong
    wsSend(ws, {
      type: "helm:event",
      session: env.session,
      event: sanitizeEvent(message),
    });

    // Log a brief status to terminal
    if (message.type === "assistant") {
      process.stdout.write(".");
    } else if (message.type === "result") {
      console.log("\nDone.");
      wsSend(ws, { type: "helm:turn-complete", session: env.session });
    }
  }

  // After the stream ends, wait for follow-up input
  wsSend(ws, { type: "helm:waiting-for-input", session: env.session });
  console.log("\nWaiting for follow-up from browser...");
}

async function continueAgent(ws, env, userMessage) {
  let sdk;
  try {
    sdk = await import("@anthropic-ai/claude-agent-sdk");
  } catch {
    return;
  }

  const query = sdk.query || sdk.default?.query;
  if (!query) return;

  console.log("Continuing...");

  for await (const message of query({
    prompt: userMessage,
    options: {
      permissionMode: "bypassPermissions",
      continue: true,
    },
  })) {
    wsSend(ws, {
      type: "helm:event",
      session: env.session,
      event: sanitizeEvent(message),
    });

    if (message.type === "assistant") {
      process.stdout.write(".");
    } else if (message.type === "result") {
      console.log("\nDone.");
      wsSend(ws, { type: "helm:turn-complete", session: env.session });
    }
  }

  wsSend(ws, { type: "helm:waiting-for-input", session: env.session });
  console.log("\nWaiting for follow-up from browser...");
}

// --- Helpers ---

function wsSend(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function sanitizeEvent(event) {
  // The Agent SDK returns rich objects — strip any non-serializable fields
  try {
    return JSON.parse(JSON.stringify(event));
  } catch {
    return { type: event.type || "unknown" };
  }
}

function cleanup(ws) {
  try { ws.close(); } catch { /* already closed */ }
  setTimeout(() => process.exit(0), 100);
}
