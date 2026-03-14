/**
 * Passthrough mode — exec claude with --dangerously-skip-permissions.
 *
 * Replaces the current process entirely. Never returns.
 */

import { execFileSync } from "node:child_process";
import { execvp } from "./execvp.js";

export function passthrough(args) {
  const claudeArgs = ["--dangerously-skip-permissions", ...args];

  // Try native execvp (replaces process, no overhead)
  try {
    execvp("claude", claudeArgs);
  } catch {
    // Fallback: spawn as child with inherited stdio
    try {
      execFileSync("claude", claudeArgs, {
        stdio: "inherit",
        env: process.env,
      });
    } catch (err) {
      process.exit(err.status ?? 1);
    }
  }
}
