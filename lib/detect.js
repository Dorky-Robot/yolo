/**
 * Detect whether we're running inside a katulong terminal session.
 *
 * Introspects the environment rather than relying on injected env vars:
 *
 *   1. TERM_PROGRAM === "katulong"  (standard terminal convention, already set)
 *   2. Session name from tmux:      `tmux display-message -p '#{session_name}'`
 *   3. Server URL from data dir:    ~/.katulong/server.json (written on startup)
 *
 * Returns { url, session } if all three succeed, null otherwise.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export function detectKatulong() {
  // 1. Are we inside a katulong terminal?
  if (process.env.TERM_PROGRAM !== "katulong") return null;

  // 2. What tmux session are we in?
  const session = getTmuxSessionName();
  if (!session) return null;

  // 3. Where is the katulong server?
  const url = getServerUrl();
  if (!url) return null;

  return { url, session };
}

function getTmuxSessionName() {
  try {
    const name = execFileSync("tmux", ["display-message", "-p", "#{session_name}"], {
      encoding: "utf-8",
      timeout: 3000,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    return name || null;
  } catch {
    return null;
  }
}

function getServerUrl() {
  const dataDir = process.env.KATULONG_DATA_DIR || join(homedir(), ".katulong");
  const infoPath = join(dataDir, "server.json");

  try {
    const info = JSON.parse(readFileSync(infoPath, "utf-8"));
    if (!info.port) return null;

    const host = info.host === "0.0.0.0" ? "127.0.0.1" : (info.host || "127.0.0.1");
    return `http://${host}:${info.port}`;
  } catch {
    return null;
  }
}
