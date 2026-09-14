import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { getConfigPath, isConfigPathPlausible, readConfig, backupConfig, type ClaudeConfig } from './setup.ts';

/** Removes only the recall-vault entry, leaving every other server the user has configured untouched. */
export function removeRecallEntry(config: ClaudeConfig): ClaudeConfig {
  const mcpServers = { ...(config.mcpServers ?? {}) };
  delete mcpServers['recall-vault'];
  return { ...config, mcpServers };
}

export async function runUninstall(): Promise<void> {
  const platform = process.platform;
  const configPath = getConfigPath(platform);
  const plausible = await isConfigPathPlausible(configPath, platform);

  if (!plausible) {
    console.log(
      "Could not find Claude Desktop's config directory at the expected location for this platform. Nothing was changed.",
    );
    return;
  }

  let config: ClaudeConfig;
  try {
    config = await readConfig(configPath);
  } catch {
    console.log('Could not parse the existing config file as JSON. Nothing was changed.');
    return;
  }

  await backupConfig(configPath);
  const updated = removeRecallEntry(config);
  await fs.writeFile(configPath, JSON.stringify(updated, null, 2) + '\n', 'utf8');

  const vaultRoot = process.env.RECALL_VAULT ?? path.join(os.homedir(), 'Recall');
  console.log("Removed recall-vault from Claude Desktop's config. Restart Claude Desktop to pick it up.");
  console.log(`Your notes in ${vaultRoot} were left alone.`);
  console.log('To remove the recall-vault command itself, run: npm uninstall -g recall-vault');
}
