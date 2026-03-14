/**
 * execvp — replace the current process with a new command.
 *
 * Uses child_process.spawnSync as a portable fallback since Node
 * doesn't expose a native execvp. The spawn inherits stdio and
 * forwards the exit code.
 */

import { spawnSync } from "node:child_process";

export function execvp(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: process.env,
  });

  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}
