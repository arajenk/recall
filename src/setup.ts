import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';

export interface ServerEntry {
  command: string;
  args: string[];
}

export interface ClaudeConfig {
  mcpServers?: Record<string, ServerEntry>;
  [key: string]: unknown;
}

/**
 * Where Claude Desktop's own config lives. macOS is the one path this has
 * actually been tested against; Windows and Linux are written from known
 * convention and gated behind isConfigPathPlausible before anything trusts
 * them.
 */
export function getConfigPath(platform: NodeJS.Platform = process.platform): string {
  if (platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
  }
  if (platform === 'win32') {
    const appData = process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appData, 'Claude', 'claude_desktop_config.json');
  }
  return path.join(os.homedir(), '.config', 'Claude', 'claude_desktop_config.json');
}

/**
 * A missing parent directory on Windows or Linux means the guessed path is
 * probably wrong for this machine, not that Claude Desktop needs a fresh
 * directory created for it. Skipped on macOS, where the path is already
 * confirmed real.
 */
export async function isConfigPathPlausible(
  configPath: string,
  platform: NodeJS.Platform = process.platform,
): Promise<boolean> {
  if (platform === 'darwin') return true;

  try {
    const stat = await fs.stat(path.dirname(configPath));
    return stat.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Assignment by key, so re-running setup is idempotent: an existing
 * recall-vault entry is replaced in place, never duplicated.
 */
export function mergeRecallEntry(config: ClaudeConfig, binPath: string): ClaudeConfig {
  return {
    ...config,
    mcpServers: {
      ...(config.mcpServers ?? {}),
      'recall-vault': { command: binPath, args: [] },
    },
  };
}

/**
 * A missing file starts a fresh config from scratch. A file that fails to
 * parse as JSON is surfaced to the caller, which treats it the same as a
 * bad path: abort, write nothing, fall back to the manual JSON block.
 */
export async function readConfig(configPath: string): Promise<ClaudeConfig> {
  let raw: string;
  try {
    raw = await fs.readFile(configPath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { mcpServers: {} };
    }
    throw error;
  }
  return JSON.parse(raw);
}

/** Backs up the existing config before any write touches it. A no-op if there is nothing to back up yet. */
export async function backupConfig(configPath: string): Promise<void> {
  try {
    await fs.access(configPath);
  } catch {
    return;
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  await fs.copyFile(configPath, `${configPath}.bak-${timestamp}`);
}

/** The block a user pastes in by hand when setup could not write the config itself. */
export function manualConfigBlock(binPath: string): string {
  return JSON.stringify(
    { mcpServers: { 'recall-vault': { command: binPath, args: [] } } },
    null,
    2,
  );
}

/**
 * The one step that is not meaningfully unit testable: it shells out to the
 * real npm and the real global bin directory. Isolated here so it is the
 * only untested seam, not papered over.
 */
export async function installGlobally(): Promise<string> {
  execSync('npm install -g recall-vault', { stdio: 'inherit' });
  const whichCommand = process.platform === 'win32' ? 'where recall-vault' : 'which recall-vault';
  return execSync(whichCommand).toString().trim().split('\n')[0];
}

function printManualFallback(binPath: string, reason: string): void {
  console.log(reason);
  console.log('Add this to your claude_desktop_config.json by hand:\n');
  console.log(manualConfigBlock(binPath));
}

export async function runSetup(): Promise<void> {
  const platform = process.platform;
  const configPath = getConfigPath(platform);
  const plausible = await isConfigPathPlausible(configPath, platform);
  const binPath = await installGlobally();

  if (!plausible) {
    printManualFallback(
      binPath,
      "Could not find Claude Desktop's config directory at the expected location for this platform.",
    );
    return;
  }

  let config: ClaudeConfig;
  try {
    config = await readConfig(configPath);
  } catch {
    printManualFallback(binPath, 'Could not parse the existing config file as JSON.');
    return;
  }

  await backupConfig(configPath);
  const updated = mergeRecallEntry(config, binPath);
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(updated, null, 2) + '\n', 'utf8');

  console.log('Recall is now configured in Claude Desktop. Restart Claude Desktop to pick it up.');
  if (platform !== 'darwin') {
    console.log(
      `This config path (${configPath}) is untested on ${platform}. If it did not work, please open an issue.`,
    );
  }
}
