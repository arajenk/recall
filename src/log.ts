import fs from 'node:fs';
import path from 'node:path';

/**
 * Appends a line to `<vault>/.recall/server.log`.
 *
 * Claude Desktop logs that an MCP server connected, but not the individual tool
 * calls, so when a call appears to hang there is no way to tell whether it ever
 * reached the server. This log exists to answer exactly that question.
 *
 * Deliberately synchronous and best-effort: a diagnostic that throws, or that
 * loses the last line before a hang, is worse than useless.
 */
export function log(vaultRoot: string, message: string): void {
  try {
    const dir = path.join(vaultRoot, '.recall');
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, 'server.log'), `${new Date().toISOString()} ${message}\n`);
  } catch {
    // Never let logging break a save.
  }
}
