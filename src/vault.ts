import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Resolves a model-supplied path against the vault root.
 *
 * Every path that reaches the filesystem goes through here. The model chooses
 * these paths, so they are treated as untrusted input: anything that lands
 * outside the vault is refused rather than clamped.
 */
export function resolveInVault(vaultRoot: string, requested: string): string {
  const root = path.resolve(vaultRoot);
  const resolved = path.resolve(root, requested);

  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error(`Refusing to touch "${requested}": it resolves outside the vault.`);
  }

  return resolved;
}

/** Where the machine-facing counterpart of each note is mirrored. */
export const DETAIL_ROOT = '_detail';

/**
 * Every folder in the vault, as relative paths, for the model to file against.
 *
 * Skips dot-prefixed folders (`.recall` is bookkeeping) and the detail tree,
 * which mirrors the real taxonomy rather than being part of it — offering it
 * would invite the model to file notes into it.
 */
export async function listFolders(vaultRoot: string): Promise<string[]> {
  const folders: string[] = [];

  async function walk(dir: string, prefix: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      if (!prefix && entry.name === DETAIL_ROOT) continue;

      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      folders.push(relative);
      await walk(path.join(dir, entry.name), relative);
    }
  }

  await walk(path.resolve(vaultRoot), '');
  return folders.sort();
}
