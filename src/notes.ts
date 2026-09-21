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

/**
 * Where both halves of a pair live, relative to the vault. Tolerant of a path
 * missing its ".md" extension, since the model sometimes echoes one back
 * without it after reading it off a search result. Appending it here is
 * strictly additive: a path that already carries it passes through
 * untouched, so this only recovers a call that would otherwise fail on a
 * trivial mismatch, it never changes which note a well-formed path resolves
 * to.
 */
function pairPaths(notePath: string): SavedPair {
  const note = notePath.endsWith('.md') ? notePath : `${notePath}.md`;
  return { note, detail: `${DETAIL_ROOT}/${note}` };
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

/**
 * The readable half is prose under a single top level title; the prompt's hard
 * rule is no headers inside it at all. This backs that rule with a check
 * instead of leaving it to the prompt, the same move `RETENTION_FLOOR` makes.
 *
 * It exists because of a real corruption this shape catches: `recall_read_note`
 * used to hand back both halves as one block of text with a `## detail` heading
 * marking where the second half began. A whole-text rewrite of the readable
 * half, built from that response, could drag the heading and everything under
 * it along into what got submitted as `content`, writing the entire detail
 * half into the note the user actually reads. The read format that caused it
 * is fixed, but a heading in `content` is never legitimate on its own terms
 * either, so refusing it here catches the same mistake however it happens.
 */
function assertNoHeadingInContent(content: string, label: string): void {
  const heading = /^#{2,}[ \t].*$/m.exec(content);
  if (!heading) return;

  throw new Error(
    `The readable half of "${label}" contains a heading ("${heading[0].trim()}"), which ` +
      'the prompt says never belongs in the readable note. This is the exact shape of a ' +
      'known mistake: the detail half getting embedded inside content instead of staying ' +
      'in its own file. Send `content` as prose only, with attribution and detail staying ' +
      'in `detail`.',
  );
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

  assertNoHeadingInContent(note.content, relative.note);

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

export type ContextEntry =
  | { path: string; ok: true; saved: string; updated: string; detail: string }
  | { path: string; ok: false; error: string };

/**
 * Loads the detail half of specific notes, with their dates, for feeding back
 * into a conversation as background. Never the readable half: the readable
 * half has its attribution brackets stripped, and the whole point of feeding
 * context back is reasoning over who said what.
 *
 * Every path is attempted independently. One bad path in a batch does not
 * lose the notes that were fine, and a missing detail half is reported rather
 * than silently skipped, since the pair invariant says it should not happen.
 */
export async function loadContext(
  vaultRoot: string,
  notePaths: string[],
): Promise<ContextEntry[]> {
  const entries: ContextEntry[] = [];

  for (const notePath of notePaths) {
    try {
      const relative = pairPaths(notePath);
      const absoluteNote = resolveInVault(vaultRoot, relative.note);
      const absoluteDetail = resolveInVault(vaultRoot, relative.detail);

      if (!(await exists(absoluteNote))) {
        throw new Error(`There is no note at "${relative.note}".`);
      }
      if (!(await exists(absoluteDetail))) {
        throw new Error(
          `The note "${relative.note}" has lost its detail half, which should be at ` +
            `"${relative.detail}". Refusing to load half a pair.`,
        );
      }

      const { fields, body } = splitFrontmatter(await fs.readFile(absoluteDetail, 'utf8'));
      entries.push({
        path: notePath,
        ok: true,
        saved: fields.saved ?? '(unknown)',
        updated: fields.updated ?? '(unknown)',
        detail: body,
      });
    } catch (error) {
      entries.push({ path: notePath, ok: false, error: (error as Error).message });
    }
  }

  return entries;
}

/** One anchored find-and-replace, the same contract as a text editor's. */
export interface TextEdit {
  oldStr: string;
  newStr: string;
}

export interface NoteUpdate {
  /** Vault-relative path of the readable half, as `readNote` was given it. */
  path: string;
  /**
   * The readable half. Whole text replaces it outright; an edits list changes
   * only the parts that changed; leaving both out leaves this half exactly as
   * it is. Passing both is an error, since it is not clear which one wins.
   */
  content?: string;
  contentEdits?: TextEdit[];
  /** The detail half, on the same terms as `content`/`contentEdits`. */
  detail?: string;
  detailEdits?: TextEdit[];
  /**
   * Why this update is allowed to remove material that was already in the note.
   * Required only when it removes a lot of it. See `RETENTION_FLOOR`.
   */
  dropping?: string;
  /** Supplied only to correct or newly establish it; otherwise carried forward. */
  conversationDate?: string;
  conversationDateBasis?: string;
}

function truncateForError(text: string): string {
  return text.length > 80 ? `${text.slice(0, 80)}...` : text;
}

/**
 * Applies anchored replacements to a note half. Each `oldStr` must appear
 * exactly once in the text it is applied against (checked against the result
 * of any earlier edit in the list, not the original, so a later edit can
 * target text an earlier one just introduced). This exists so an update can
 * change one bullet or one sentence without the model having to retype
 * everything around it, which is the actual reason updates were failing
 * their first attempt: reproducing a whole multi-thousand-character half from
 * memory is where the model was going wrong, not a wording problem.
 */
function applyEdits(original: string, edits: TextEdit[], label: string): string {
  let result = original;
  for (const edit of edits) {
    const occurrences = result.split(edit.oldStr).length - 1;
    if (occurrences === 0) {
      throw new Error(
        `Could not find the text to replace in the ${label} half: ` +
          `"${truncateForError(edit.oldStr)}". It must match exactly, whitespace ` +
          `included, copied from what \`recall_read_note\` returned rather than ` +
          `retyped from memory.`,
      );
    }
    if (occurrences > 1) {
      throw new Error(
        `The text to replace in the ${label} half is not unique, it appears ` +
          `${occurrences} times: "${truncateForError(edit.oldStr)}". Include more of ` +
          `its surrounding text so it matches only the one place you mean.`,
      );
    }
    result = result.replace(edit.oldStr, edit.newStr);
  }
  return result;
}

/** Resolves one half of an update to its final text: whole, patched, or unchanged. */
function resolveHalf(
  original: string,
  whole: string | undefined,
  edits: TextEdit[] | undefined,
  label: string,
): string {
  if (whole !== undefined && edits !== undefined) {
    throw new Error(
      `Pass either the whole ${label} half or edits to it, not both, for one update.`,
    );
  }
  if (whole !== undefined) return whole;
  if (edits !== undefined) return applyEdits(original, edits, label);
  return original;
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

  if (
    update.content === undefined &&
    update.contentEdits === undefined &&
    update.detail === undefined &&
    update.detailEdits === undefined
  ) {
    throw new Error(
      'Nothing to update: pass content, content_edits, detail, or detail_edits.',
    );
  }

  const originalBodies = {
    note: splitFrontmatter(originals.note).body,
    detail: splitFrontmatter(originals.detail).body,
  };
  const resolved = {
    note: resolveHalf(originalBodies.note, update.content, update.contentEdits, 'readable'),
    detail: resolveHalf(originalBodies.detail, update.detail, update.detailEdits, 'detail'),
  };

  // Only checked when this call actually touches content. A note corrupted before
  // this check existed must still be able to receive a detail-only edit without
  // getting blocked on a heading it did not just introduce.
  if (update.content !== undefined || update.contentEdits !== undefined) {
    assertNoHeadingInContent(resolved.note, update.path);
  }

  const stamps = {
    saved: previous.saved ?? isoDate(now),
    updated: isoDate(now),
  };
  const dated = {
    conversationDate: update.conversationDate ?? previous.conversation_date,
    conversationDateBasis: update.conversationDateBasis ?? previous.conversation_date_basis,
  };
  const bodies: SavedPair = {
    note: frontmatter(stamps, dated, { key: 'detail', path: relative.detail }) + resolved.note,
    detail: frontmatter(stamps, dated, { key: 'note', path: relative.note }) + resolved.detail,
  };

  if (!update.dropping?.trim()) {
    const before = originalBodies;
    const after = resolved;
    const label = { note: 'readable', detail: 'detail' };

    for (const side of ['note', 'detail'] as const) {
      if (!before[side].length) continue;
      const kept = after[side].length / before[side].length;
      if (kept >= RETENTION_FLOOR) continue;

      throw new Error(
        `This update would drop ${Math.round((1 - kept) * 100)}% of the ${label[side]} ` +
          `half of "${relative.note}" (currently ${before[side].length} characters, yours ` +
          `is ${after[side].length}). Most of what is in a note came from conversations ` +
          `you cannot see, so it is not yours to cut for seeming irrelevant. Fold your ` +
          `new material into what is already there, keeping the rest at or near its ` +
          `current length, and send the whole thing again rather than guessing at a ` +
          `size. If the material really is finished with, pass \`dropping\` to say why, ` +
          `and be specific.`,
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
