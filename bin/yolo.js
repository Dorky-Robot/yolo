#!/usr/bin/env node

/**
 * yolo — Claude Code launcher.
 *
 * Runs `claude --dangerously-skip-permissions` in the terminal.
 * When katulong is detected, writes a local hooks config so Claude Code
 * streams events to katulong's helm companion view. The TUI stays in
 * the terminal — helm is a companion, not a replacement.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { detectKatulong } from "../lib/detect.js";
import { passthrough } from "../lib/passthrough.js";

const env = detectKatulong();

if (env) {
  // Write project-local hooks config so only THIS session sends events.
  // .claude/settings.local.json is git-ignored and scoped to the cwd.
  const hookUrl = `${env.url}/api/helm/hook`;
  const hooksConfig = {
    hooks: {
      UserPromptSubmit: [{ matcher: "", hooks: [{ type: "http", url: hookUrl, async: true }] }],
      PreToolUse: [{ matcher: "", hooks: [{ type: "http", url: hookUrl, async: true }] }],
      PostToolUse: [{ matcher: "", hooks: [{ type: "http", url: hookUrl, async: true }] }],
      Stop: [{ matcher: "", hooks: [{ type: "http", url: hookUrl, async: true }] }],
      Notification: [{ matcher: "", hooks: [{ type: "http", url: hookUrl, async: true }] }],
    },
  };

  try {
    mkdirSync(join(process.cwd(), ".claude"), { recursive: true });
    writeFileSync(
      join(process.cwd(), ".claude", "settings.local.json"),
      JSON.stringify(hooksConfig, null, 2) + "\n",
    );
  } catch {
    // Non-fatal — claude still works, just no helm companion
  }

  // Notify katulong that a session is starting
  try {
    await fetch(`${env.url}/api/helm/hook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hook_event_name: "SessionStart",
        session_id: env.session,
        cwd: process.cwd(),
        agent: "claude-code",
      }),
    });
  } catch {
    // Non-fatal
  }
}

// Always run claude in the terminal with full TUI
passthrough(process.argv.slice(2));
