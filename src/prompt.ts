import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROMPT_FILE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'prompts',
  'extraction-prompt.md',
);

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
