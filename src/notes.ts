import fs from 'node:fs/promises';
import path from 'node:path';

import { resolveInVault, DETAIL_ROOT, ARCHIVE_ROOT } from './vault.ts';

export interface NoteToSave {
  folder: string;
  title: string;
  /** The readable note. This is the one the user actually reads. */
  content: string;
  /** The machine-facing counterpart: attribution tags, evidence, confidence. */
  detail: string;
  /**
   * When the conversation actually happened, if, and only if, that is known
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

/** The two halves of a note as text, the same shape `saveNote` is given. */
export interface NoteBodies {
  content: string;
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
 * that actually knows the time. They describe when Recall wrote the note, not
 * when the conversation happened, which is a different fact Recall usually
 * cannot know. Keeping them separate is what stops an old thread saved today
 * from later reading as fresh.
 *
 * `counterpart` links the readable note and its detail file to each other, so
 * neither can be picked up in isolation and mistaken for the whole record.
 */
function frontmatter(
  dates: { saved: string; updated: string },
  note: Pick<NoteToSave, 'conversationDate' | 'conversationDateBasis'>,
  counterpart: { key: 'note' | 'detail'; path: string },
): string {
  const lines = [`saved: ${dates.saved}`, `updated: ${dates.updated}`];

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

/**
 * Splits a stored note into its frontmatter fields and its body.
 *
 * The body is what goes back to the model. The frontmatter is the server's own
 * bookkeeping, and handing it over would invite the model to copy a `saved:`
 * line into the replacement it writes, leaving the note with two of them.
 */
export function splitFrontmatter(raw: string): { fields: Record<string, string>; body: string } {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(raw);

  if (!match) return { fields: {}, body: raw };

  const fields: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const separator = line.indexOf(': ');
    if (separator > 0) fields[line.slice(0, separator)] = line.slice(separator + 2);
  }

  return { fields, body: raw.slice(match[0].length).replace(/^\n/, '') };
}

/** Where both halves of a pair live, relative to the vault. */
function pairPaths(notePath: string): SavedPair {
  return { note: notePath, detail: `${DETAIL_ROOT}/${notePath}` };
}

/**
 * Reads a pair back so the model can fold new material into it and hand back a
 * rewritten whole.
 *
 * A half that is missing is an error rather than an empty string. The pair is
 * the unit; half of one is a broken record, and failing loudly is how it gets
 * noticed instead of being quietly written back as a note that lost its
 * attribution detail.
 */
export async function readNote(vaultRoot: string, notePath: string): Promise<NoteBodies> {
  const relative = pairPaths(notePath);
  const absolute: SavedPair = {
    note: resolveInVault(vaultRoot, relative.note),
    detail: resolveInVault(vaultRoot, relative.detail),
  };

  if (!(await exists(absolute.note))) {
    throw new Error(`There is no note at "${relative.note}".`);
  }
  if (!(await exists(absolute.detail))) {
    throw new Error(
      `The note "${relative.note}" has lost its detail half, which should be at ` +
        `"${relative.detail}". Refusing to read half a pair.`,
    );
  }

  return {
    content: splitFrontmatter(await fs.readFile(absolute.note, 'utf8')).body,
    detail: splitFrontmatter(await fs.readFile(absolute.detail, 'utf8')).body,
  };
}

/**
 * The message a create gets when the path is taken. The `wx` flag below is the
 * real guarantee, not the check that precedes it, so this has to be reachable
 * from both: two saves of the same title can each pass the check before either
 * one writes, and the loser should still be told what to do about it.
 */
function alreadyExistsError(relativePath: string): Error {
  return new Error(
    `A note already exists at "${relativePath}". To fold new material into it, ` +
      `read it and call the update tool instead. To keep it, choose a different title.`,
  );
}

function isCollision(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === 'EEXIST';
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
  const stamps = { saved: isoDate(now), updated: isoDate(now) };
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
    note:
      frontmatter(stamps, note, { key: 'detail', path: relative.detail }) + note.content,
    detail: frontmatter(stamps, note, { key: 'note', path: relative.note }) + note.detail,
  };

  for (const side of ['note', 'detail'] as const) {
    if (await exists(absolute[side])) throw alreadyExistsError(relative[side]);
  }

  await fs.mkdir(path.dirname(absolute.note), { recursive: true });
  await fs.mkdir(path.dirname(absolute.detail), { recursive: true });

  try {
    await fs.writeFile(absolute.note, bodies.note, { encoding: 'utf8', flag: 'wx' });
  } catch (error) {
    throw isCollision(error) ? alreadyExistsError(relative.note) : error;
  }

  try {
    await fs.writeFile(absolute.detail, bodies.detail, { encoding: 'utf8', flag: 'wx' });
  } catch (error) {
    // Never leave half a pair behind.
    await fs.rm(absolute.note, { force: true });
    throw isCollision(error) ? alreadyExistsError(relative.detail) : error;
  }

  return relative;
}

export interface NoteUpdate extends NoteBodies {
  /** Vault-relative path of the readable half, as `readNote` was given it. */
  path: string;
  /**
   * Why this update is allowed to remove material that was already in the note.
   * Required only when it removes a lot of it. See `RETENTION_FLOOR`.
   */
  dropping?: string;
  /** Supplied only to correct or newly establish it; otherwise carried forward. */
  conversationDate?: string;
  conversationDateBasis?: string;
}

export interface UpdatedPair extends SavedPair {
  archived: SavedPair;
}

/**
 * How much of a half an update may remove before it has to say why.
 *
 * An update sees the note plus one conversation, never the conversations that
 * filled it, so removing a lot of it is usually a mistake rather than an edit.
 * The server cannot tell which conversation is calling, so it cannot simply
 * refuse: trimming a dead end you raised yourself is legitimate. Instead the
 * loss has to be stated, which turns a silent deletion into a deliberate one
 * that lands in the log.
 *
 * This is a floor, not a guarantee. An update that adds a lot while cutting
 * something specific can still net out above it.
 */
const RETENTION_FLOOR = 0.7;

/**
 * Where a superseded version of a pair goes: a folder per note, holding one
 * timestamped file per version. The timestamp keeps its full precision, since
 * two updates on the same day are ordinary, and its colons are swapped out
 * because a colon is not a character to put in a filename.
 */
function archivePathsFor(notePath: string, now: Date): SavedPair {
  const stem = notePath.replace(/\.md$/, '');
  const stamp = now.toISOString().replace(/[:.]/g, '-');

  return {
    note: `${ARCHIVE_ROOT}/${stem}/${stamp}.md`,
    detail: `${ARCHIVE_ROOT}/${DETAIL_ROOT}/${stem}/${stamp}.md`,
  };
}

/**
 * Replaces both halves of an existing pair with a rewritten whole, keeping the
 * superseded version under the archive.
 *
 * The archive is what makes this safe to do at all: `saveNote` refuses to
 * overwrite because an overwrite with no way back destroys a note, and the way
 * back is what this writes first.
 *
 * `saved` is carried forward from the note being replaced, so a note that gets
 * updated does not start reading as though it were written today. Only
 * `updated` moves. The conversation date carries forward for the same reason,
 * unless this update establishes a better one.
 */
export async function updateNote(
  vaultRoot: string,
  update: NoteUpdate,
  options: SaveOptions = {},
): Promise<UpdatedPair> {
  const now = options.now ?? new Date();
  const relative = pairPaths(update.path);
  const absolute: SavedPair = {
    note: resolveInVault(vaultRoot, relative.note),
    detail: resolveInVault(vaultRoot, relative.detail),
  };

  if (!(await exists(absolute.note))) {
    throw new Error(`There is no note at "${relative.note}" to update.`);
  }
  if (!(await exists(absolute.detail))) {
    throw new Error(
      `The note "${relative.note}" has lost its detail half, which should be at ` +
        `"${relative.detail}". Refusing to update half a pair.`,
    );
  }

  // Held in memory for the whole write, so a failure partway can put back exactly
  // what was there rather than an approximation of it.
  const originals: SavedPair = {
    note: await fs.readFile(absolute.note, 'utf8'),
    detail: await fs.readFile(absolute.detail, 'utf8'),
  };
  const previous = splitFrontmatter(originals.note).fields;

  const stamps = {
    saved: previous.saved ?? isoDate(now),
    updated: isoDate(now),
  };
  const dated = {
    conversationDate: update.conversationDate ?? previous.conversation_date,
    conversationDateBasis: update.conversationDateBasis ?? previous.conversation_date_basis,
  };
  const bodies: SavedPair = {
    note: frontmatter(stamps, dated, { key: 'detail', path: relative.detail }) + update.content,
    detail: frontmatter(stamps, dated, { key: 'note', path: relative.note }) + update.detail,
  };

  if (!update.dropping?.trim()) {
    const before = {
      note: splitFrontmatter(originals.note).body,
      detail: splitFrontmatter(originals.detail).body,
    };
    const after = { note: update.content, detail: update.detail };
    const label = { note: 'readable', detail: 'detail' };

    for (const side of ['note', 'detail'] as const) {
      if (!before[side].length) continue;
      const kept = after[side].length / before[side].length;
      if (kept >= RETENTION_FLOOR) continue;

      throw new Error(
        `This update would drop ${Math.round((1 - kept) * 100)}% of the ${label[side]} ` +
          `half of "${relative.note}". Most of what is in a note came from conversations ` +
          `you cannot see, so it is not yours to cut for seeming irrelevant. Fold your ` +
          `new material into what is already there and keep the rest. If the material ` +
          `really is finished with, pass \`dropping\` to say why, and be specific.`,
      );
    }
  }

  const archived = archivePathsFor(update.path, now);
  for (const side of ['note', 'detail'] as const) {
    const target = resolveInVault(vaultRoot, archived[side]);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, originals[side], 'utf8');
  }

  await fs.writeFile(absolute.note, bodies.note, 'utf8');
  try {
    await fs.writeFile(absolute.detail, bodies.detail, 'utf8');
  } catch (error) {
    // Put the pair back as it was. The archive copy stays; a spare version costs
    // nothing, and a half-updated note costs the record.
    await fs.writeFile(absolute.note, originals.note, 'utf8');
    throw error;
  }

  return { ...relative, archived };
}
