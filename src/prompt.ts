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
