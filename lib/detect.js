/**
 * Detect whether katulong is reachable and we should use helm mode.
 *
 * Detection strategy (in priority order):
 *
 *   1. Inside a katulong terminal session:
 *      TERM_PROGRAM === "katulong" + tmux session name + server.json
 *
 *   2. Katulong is running on this machine:
 *      server.json exists and the health endpoint responds.
 *      Session name derived from cwd basename or hostname.
 *
 * Returns { url, session } if katulong is reachable, null otherwise.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, basename } from "node:path";
import { homedir, hostname } from "node:os";

export function detectKatulong() {
  // Fast path: inside a katulong-managed terminal session
  if (process.env.TERM_PROGRAM === "katulong") {
    const session = getTmuxSessionName();
    const url = getServerUrl();
    if (session && url) return { url, session };
  }

  // Broad path: katulong is running on this machine (e.g. inside a kubo)
  const url = getServerUrl();
  if (url && isServerAlive(url)) {
    const session = getTmuxSessionName() || deriveSessionName();
    return { url, session };
  }

  return null;
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

function isServerAlive(url) {
  try {
    execFileSync("curl", ["-sf", "--max-time", "1", `${url}/health`], {
      encoding: "utf-8",
      timeout: 2000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Derive a session name when we're not inside a tmux session.
 * Uses the working directory basename, falling back to hostname.
 */
function deriveSessionName() {
  const cwd = process.cwd();
  return basename(cwd) || hostname() || "helm";
}
