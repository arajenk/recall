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
 * Where superseded versions of a pair are kept. Under the dot-folder, so it is
 * hidden from the model, from `listFolders`, and from Obsidian.
 */
export const ARCHIVE_ROOT = '.recall/archive';

/**
 * Every folder in the vault, as relative paths, for the model to file against.
 *
 * Skips dot-prefixed folders (`.recall` is bookkeeping) and the detail tree,
 * which mirrors the real taxonomy rather than being part of it. Offering it
 * would invite the model to file notes into it.
 */
export async function listFolders(vaultRoot: string): Promise<string[]> {
  const folders: string[] = [];

  async function walk(dir: string, prefix: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    // Sibling subfolders don't depend on each other, so walking them
    // concurrently rather than one at a time is free: the result is sorted
    // below regardless of which one finishes first.
    await Promise.all(
      entries.map(async (entry) => {
        if (!entry.isDirectory() || entry.name.startsWith('.')) return;
        if (!prefix && entry.name === DETAIL_ROOT) return;

        const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
        folders.push(relative);
        await walk(path.join(dir, entry.name), relative);
      }),
    );
  }

  await walk(path.resolve(vaultRoot), '');
  return folders.sort();
}

/**
 * Every note in the vault, as relative paths, so the model can see what it has
 * already written and recognise a conversation that continues one of them.
 *
 * Skips the same trees `listFolders` does, for the same reason, and skips files
 * that are not notes: a vault synced to a Mac collects `.DS_Store` files, and
 * offering one as a note to update would be nonsense.
 */
export async function listNotes(vaultRoot: string): Promise<string[]> {
  const notes: string[] = [];

  async function walk(dir: string, prefix: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    // Same reasoning as listFolders: siblings are independent, and the final
    // list is sorted below, so there is no ordering to preserve here.
    await Promise.all(
      entries.map(async (entry) => {
        if (entry.name.startsWith('.')) return;
        const relative = prefix ? `${prefix}/${entry.name}` : entry.name;

        if (entry.isDirectory()) {
          if (!prefix && entry.name === DETAIL_ROOT) return;
          await walk(path.join(dir, entry.name), relative);
        } else if (entry.name.endsWith('.md')) {
          notes.push(relative);
        }
      }),
    );
  }

  await walk(path.resolve(vaultRoot), '');
  return notes.sort();
}
