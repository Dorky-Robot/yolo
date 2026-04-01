#!/usr/bin/env node

/**
 * yolo — Claude Code launcher.
 *
 * In a regular terminal: execs `claude --dangerously-skip-permissions`.
 * Inside a katulong session: switches to browser-based mode via the
 * katulong claude session API, streaming structured conversation events
 * to the web UI instead of rendering a TUI in the terminal.
 */

// TODO: Helm mode (katulong integration) is disabled for now — not yet
// ready for the official release.  Work continues on a feature branch.
//
// import { detectKatulong } from "../lib/detect.js";
// import { katulongMode } from "../lib/katulong-mode.js";
//
// const env = detectKatulong();
// if (env) {
//   await katulongMode(env, process.argv.slice(2));
// }

import { parseSession } from "../lib/session-env.js";
import { passthrough } from "../lib/passthrough.js";

// Export SIPAG_PROJECT and SIPAG_ROLE from the katulong session name
// so Claude Code hooks can publish to the correct pub/sub topic.
parseSession();

passthrough(process.argv.slice(2));
