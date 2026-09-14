import fs from 'node:fs/promises';

import { listNotes, resolveInVault } from './vault.ts';

export interface NoteSummary {
  path: string;
  saved: string;
  updated: string;
  gist: string;
}

/** How many matches `searchNotes` hands back. A menu, not the whole vault. */
const RESULT_CAP = 5;

const FRONTMATTER = /^---\n[\s\S]*?\n---\n\n?/;

function parse(raw: string): { saved?: string; updated?: string; body: string } {
  const match = FRONTMATTER.exec(raw);
  if (!match) return { body: raw };

  const fields: Record<string, string> = {};
  for (const line of match[0].split('\n')) {
    const separator = line.indexOf(': ');
    if (separator > 0) fields[line.slice(0, separator)] = line.slice(separator + 2);
  }

  return { saved: fields.saved, updated: fields.updated, body: raw.slice(match[0].length) };
}

/**
 * A one line gist: the note's own heading and the line right after it. No new
 * storage, since the note already carries both.
 */
function gistOf(body: string): string {
  const lines = body
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const heading = lines.find((line) => line.startsWith('# '))?.replace(/^#\s+/, '');
  const opening = lines.find((line) => !line.startsWith('#'));

  return [heading, opening].filter(Boolean).join(': ') || '(no gist available)';
}

/**
 * Every note's title, for the standing list embedded in `recall_search`'s
 * description. Titles only, no content read, so this stays nearly free at
 * startup even as the vault grows.
 */
export async function listNoteTitles(vaultRoot: string): Promise<string[]> {
  const notes = await listNotes(vaultRoot);
  return notes.map((notePath) => notePath.replace(/\.md$/, ''));
}

/**
 * Plain text search over paths and note bodies, capped at `RESULT_CAP` so the
 * model gets a menu rather than the meal: each match is a path, its saved and
 * updated dates, and a gist, never the note itself. Reading a specific note's
 * content is a different tool's job.
 */
export async function searchNotes(vaultRoot: string, query: string): Promise<NoteSummary[]> {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];

  const notes = await listNotes(vaultRoot);
  const matches: NoteSummary[] = [];

  for (const notePath of notes) {
    const raw = await fs.readFile(resolveInVault(vaultRoot, notePath), 'utf8');
    const haystack = `${notePath}\n${raw}`.toLowerCase();
    if (!terms.every((term) => haystack.includes(term))) continue;

    const { saved, updated, body } = parse(raw);
    matches.push({
      path: notePath,
      saved: saved ?? '(unknown)',
      updated: updated ?? '(unknown)',
      gist: gistOf(body),
    });
    if (matches.length >= RESULT_CAP) break;
  }

  return matches;
}
