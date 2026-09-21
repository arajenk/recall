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
 * Strips a handful of common English suffixes so "assignments" reads the same
 * as "assignment" and "meetings" the same as "meeting". Deliberately crude:
 * it only has to land two forms of the same word on one shared string, not
 * produce an actual linguistic root, and the longest suffixes are checked
 * first so "meetings" loses "-ings" in one step rather than "-s" then
 * stopping short of "-ing" underneath it.
 */
function stem(word: string): string {
  if (word.length > 5 && word.endsWith('ings')) return word.slice(0, -4);
  if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.length > 4 && /[^aeiou]es$/.test(word)) return word.slice(0, -2);
  if (word.length > 4 && word.endsWith('ing')) return word.slice(0, -3);
  if (word.length > 4 && word.endsWith('ed')) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

/**
 * A word next to its stem, and, when a suffix actually came off, the stem
 * with a trailing "e" put back as well. That second form is what lets
 * "coding" reach "code" and "decided" reach "decide": stripping "-ing" or
 * "-ed" alone leaves "cod" and "decid", which is not a real stem, only half
 * of the silent-e pattern English verbs use. Trying both costs one string
 * per word and only ever widens what a stem can match, not narrows it.
 */
function stemCandidates(word: string): string[] {
  const stemmed = stem(word);
  return stemmed === word ? [stemmed] : [stemmed, `${stemmed}e`];
}

function tokenize(text: string): string[] {
  return text.split(/[^a-z0-9]+/).filter(Boolean);
}

/**
 * A term matches a note if it appears literally, which is checked first and
 * stays exact, so a query that already worked keeps working unchanged. Only
 * when that fails does this fall back to comparing stems against the note's
 * own words, which is what catches an odd plural or tense the literal check
 * would otherwise miss.
 */
function termMatches(term: string, haystack: string, haystackWords: string[]): boolean {
  if (haystack.includes(term)) return true;

  const termStems = stemCandidates(term);
  return haystackWords.some((word) => stemCandidates(word).some((stemmed) => termStems.includes(stemmed)));
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
  // A search with few or no hits (the common case) reads the whole vault
  // either way, so reading concurrently rather than one file at a time
  // overlaps the disk waits instead of paying them back to back.
  const raws = await Promise.all(
    notes.map((notePath) => fs.readFile(resolveInVault(vaultRoot, notePath), 'utf8')),
  );

  const matches: NoteSummary[] = [];
  for (let i = 0; i < notes.length; i++) {
    const notePath = notes[i];
    const raw = raws[i];
    const haystack = `${notePath}\n${raw}`.toLowerCase();
    const haystackWords = tokenize(haystack);
    if (!terms.every((term) => termMatches(term, haystack, haystackWords))) continue;

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
