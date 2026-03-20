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

import { passthrough } from "../lib/passthrough.js";

passthrough(process.argv.slice(2));
