import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { listFolders, listNotes } from './vault.ts';

const PROMPT_FILE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'prompts',
  'extraction-prompt.md',
);

/**
 * How the model reports back once the notes are filed.
 *
 * Deliberately strict about length. Left looser, it explains where it filed
 * things and why, then keeps offering to save whatever comes up next, and the
 * conversation ends up being about Recall rather than about whatever the user
 * was actually doing. Em dashes are fine here: this is chat, not a note.
 *
 * It closes by handing the conversation back. This prompt governs the save and
 * nothing else, so it says so plainly rather than leaving a standing rule that
 * quietly shapes how the model behaves for the rest of the thread.
 */
export const OUTPUT_INSTRUCTION =
  'For a new subject, call `recall_save_note`. For a subject that already has a note, ' +
  'call `recall_read_note` for its current text and then `recall_update_note` with the ' +
  'rewritten whole. Either way pass both halves (`content` and `detail`) in the same ' +
  'call, one call per note. Do not print the notes into the chat, the tools are what ' +
  'file them.\n\n' +
  'Then report exactly this and nothing else:\n\n' +
  'Saved:\n' +
  '<path> (created)\n' +
  '<path> (updated)\n\n' +
  'Then, only if you made a folder that did not exist, one line per folder:\n\n' +
  'New folder: <path>\n\n' +
  'No reasoning about where things went, no justification for a folder name, no advice ' +
  'about what to check, no questions, no closing remark. If a call failed, say what ' +
  'failed in one line instead of the path.\n\n' +
  'If nothing in the conversation is worth keeping, the whole report is the single line ' +
  '`Nothing worth saving.` Say it without listing what you passed over and without ' +
  'explaining why, since deciding a conversation was not worth filing is the ordinary ' +
  'outcome and does not need defending.\n\n' +
  'That completes the save. Carry on with the conversation exactly as you normally ' +
  'would. The only thing that carries over is that the save is finished, so do not offer ' +
  'to save anything else and do not ask what is worth keeping unless the user raises it.';

export interface PromptValues {
  FOLDER_TREE: string;
  EXISTING_NOTES: string;
  OUTPUT_INSTRUCTION: string;
}

/**
 * Builds the extraction prompt from the canonical template.
 *
 * The template is read from disk rather than inlined here on purpose: it is the
 * single source of truth shared by every path into Recall, and it must never
 * fork per platform or per caller.
 */
export async function buildPrompt(values: PromptValues): Promise<string> {
  const template = await fs.readFile(PROMPT_FILE, 'utf8');

  const filled = template.replace(/\{\{([A-Z_]+)\}\}/g, (_match, name: string) => {
    const value = values[name as keyof PromptValues];
    if (value === undefined) {
      throw new Error(`No value supplied for prompt placeholder {{${name}}}.`);
    }
    return value;
  });

  return filled;
}

/**
 * The inventory the model matches this conversation against.
 *
 * Paths only. The bodies stay on disk and are fetched one at a time, because a
 * vault of any size would otherwise send the whole thing to update one note.
 */
export function describeExistingNotes(notes: string[]): string {
  if (!notes.length) {
    return 'No notes saved yet. The vault is empty, so everything here is new.';
  }

  return (
    'Notes already in the vault:\n\n' +
    notes.map((note) => `- ${note}`).join('\n') +
    '\n\nThese are paths, not contents. Before you rewrite one, call `recall_read_note` ' +
    'with its path to read both halves, so you fold new material into what is actually ' +
    'there rather than writing over it from memory.'
  );
}

const EMPTY_TREE = '(none yet, the vault is empty)';

/**
 * The save prompt, filled against the vault as it stands right now.
 *
 * Both ways in go through here: the `save-memory` prompt in the menu and the
 * tool the model calls when the user just asks in the chat. They must produce
 * the same instructions, or the vault ends up with two note formats depending
 * on which one the user happened to reach for.
 */
export async function buildSaveMemoryPrompt(vaultRoot: string): Promise<string> {
  const [folders, notes] = await Promise.all([listFolders(vaultRoot), listNotes(vaultRoot)]);

  return buildPrompt({
    FOLDER_TREE: folders.length ? folders.join('\n') : EMPTY_TREE,
    EXISTING_NOTES: describeExistingNotes(notes),
    OUTPUT_INSTRUCTION,
  });
}
