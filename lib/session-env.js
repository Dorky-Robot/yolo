/**
 * session-env.js — Parse katulong session name into SIPAG_PROJECT and SIPAG_ROLE.
 *
 * Katulong crew sessions use the naming convention: {project}--{role}
 * (double-dash separator). This module extracts those components and
 * exports them as environment variables so Claude Code hooks can
 * publish to the correct pub/sub topic.
 *
 * Environment:
 *   KATULONG_SESSION — session name set by katulong crew when launching
 *   SIPAG_PROJECT    — (output) project name
 *   SIPAG_ROLE       — (output) role name
 */

export function parseSession() {
  // Don't overwrite explicitly-set values
  if (process.env.SIPAG_PROJECT && process.env.SIPAG_ROLE) {
    return;
  }

  const session = process.env.KATULONG_SESSION;
  if (!session) {
    return;
  }

  // Parse "{project}--{role}" on first occurrence of "--"
  const sep = session.indexOf("--");
  if (sep < 1) {
    return;
  }

  const project = session.slice(0, sep);
  const role = session.slice(sep + 2);

  if (!project || !role) {
    return;
  }

  if (!process.env.SIPAG_PROJECT) {
    process.env.SIPAG_PROJECT = project;
  }
  if (!process.env.SIPAG_ROLE) {
    process.env.SIPAG_ROLE = role;
  }
}
