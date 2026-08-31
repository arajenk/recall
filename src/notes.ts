import fs from 'node:fs/promises';
import path from 'node:path';

import { resolveInVault, DETAIL_ROOT } from './vault.ts';

export interface NoteToSave {
  folder: string;
  title: string;
  /** The readable note. This is the one the user actually reads. */
  content: string;
  /** The machine-facing counterpart: attribution tags, evidence, confidence. */
  detail: string;
  /**
   * When the conversation actually happened, if — and only if — that is known
   * from evidence. MCP exposes no conversation metadata to the server, and the
   * model cannot see message timestamps either, so this is absent far more
   * often than not. Absent means unknown; it must never quietly become today.
   */
  conversationDate?: string;
  /** How the conversation date was established. Required whenever one is given. */
  conversationDateBasis?: string;
}

export interface SavedPair {
  note: string;
  detail: string;
}

export interface SaveOptions {
  /** Injectable so tests can assert real dates. */
  now?: Date;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Turns a note title into a filename. The title comes from the model, so it can
 * contain anything: separators would silently create folders, and the rest are
 * characters that make a file awkward to open or sync.
 */
function filenameFor(title: string): string {
  const cleaned = title.replace(/[/\\:*?"<>|]/g, '-').trim();

  if (!cleaned) throw new Error('Refusing to save a note with an empty title.');

  return `${cleaned}.md`;
}

/**
 * `saved` and `updated` are stamped by the server, which is the only party here
 * that actually knows the time. They describe when Recall wrote the note — not
 * when the conversation happened, which is a different fact Recall usually
 * cannot know. Keeping them separate is what stops an old thread saved today
 * from later reading as fresh.
 *
 * `counterpart` links the readable note and its detail file to each other, so
 * neither can be picked up in isolation and mistaken for the whole record.
 */
function frontmatter(
  now: Date,
  note: NoteToSave,
  counterpart: { key: 'note' | 'detail'; path: string },
): string {
  const lines = [`saved: ${isoDate(now)}`, `updated: ${isoDate(now)}`];

  if (note.conversationDate !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(note.conversationDate)) {
      throw new Error(
        `conversation_date must be a plain calendar date (YYYY-MM-DD), got "${note.conversationDate}".`,
      );
    }
    if (!note.conversationDateBasis?.trim()) {
      throw new Error(
        'A conversation_date requires a basis saying how it was established. ' +
          'If it was not stated or dated in the conversation, leave it out.',
      );
    }
    lines.push(`conversation_date: ${note.conversationDate}`);
    lines.push(`conversation_date_basis: ${note.conversationDateBasis.trim()}`);
  }

  lines.push(`${counterpart.key}: ${counterpart.path}`);

  return `---\n${lines.join('\n')}\n---\n\n`;
}

async function exists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

/**
 * Writes one conversation's note as a linked pair: the readable note where the
 * user will look for it, and its detail counterpart mirrored under the detail
 * tree.
 *
 * Both are written or neither is. There is deliberately no way to produce one
 * without the other, because a pair that can be written separately is a pair
 * that will eventually drift apart.
 *
 * Refuses to overwrite: until version archiving exists, an overwrite would
 * destroy a note with no way back.
 */
export async function saveNote(
  vaultRoot: string,
  note: NoteToSave,
  options: SaveOptions = {},
): Promise<SavedPair> {
  const now = options.now ?? new Date();
  const filename = filenameFor(note.title);

  const relative: SavedPair = {
    note: `${note.folder}/${filename}`,
    detail: `${DETAIL_ROOT}/${note.folder}/${filename}`,
  };

  // Everything that can be rejected is resolved before anything is written, so a
  // refused save leaves neither a partial pair nor an empty folder behind.
  const absolute: SavedPair = {
    note: resolveInVault(vaultRoot, relative.note),
    detail: resolveInVault(vaultRoot, relative.detail),
  };
  const bodies: SavedPair = {
    note: frontmatter(now, note, { key: 'detail', path: relative.detail }) + note.content,
    detail: frontmatter(now, note, { key: 'note', path: relative.note }) + note.detail,
  };

  for (const side of ['note', 'detail'] as const) {
    if (await exists(absolute[side])) {
      throw new Error(
        `A note already exists at "${relative[side]}". Updating notes is not supported yet.`,
      );
    }
  }

  await fs.mkdir(path.dirname(absolute.note), { recursive: true });
  await fs.mkdir(path.dirname(absolute.detail), { recursive: true });

  await fs.writeFile(absolute.note, bodies.note, { encoding: 'utf8', flag: 'wx' });
  try {
    await fs.writeFile(absolute.detail, bodies.detail, { encoding: 'utf8', flag: 'wx' });
  } catch (error) {
    // Never leave half a pair behind.
    await fs.rm(absolute.note, { force: true });
    throw error;
  }

  return relative;
}
