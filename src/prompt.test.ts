import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

import {
  buildPrompt,
  describeExistingNotes,
  buildSaveMemoryPrompt,
  OUTPUT_INSTRUCTION,
} from './prompt.ts';

const values = {
  FOLDER_TREE: 'Work/Acme\nContent',
  EXISTING_NOTES: 'No notes have been saved from this conversation yet.',
  OUTPUT_INSTRUCTION: 'Call recall_save_note once per note.',
};

test('fills every placeholder in the canonical prompt', async () => {
  const prompt = await buildPrompt(values);

  assert.match(prompt, /Work\/Acme/);
  assert.match(prompt, /Call recall_save_note once per note\./);
  assert.doesNotMatch(prompt, /\{\{[A-Z_]+\}\}/);
});

test('keeps the attribution rules that the whole product depends on', async () => {
  const prompt = await buildPrompt(values);

  assert.match(prompt, /\[decision\]/);
  assert.match(prompt, /never record something you generated as something the user said/i);
});

test('refuses to build a prompt with a placeholder left unfilled', async () => {
  await assert.rejects(
    () => buildPrompt({ FOLDER_TREE: 'Work' } as never),
    /EXISTING_NOTES/,
  );
});

test('says plainly when nothing has been saved yet, rather than listing nothing', async () => {
  const described = describeExistingNotes([]);

  assert.match(described, /no notes saved yet/i);
  assert.doesNotMatch(described, /recall_read_note/);
});

test('lists the existing notes and tells the model to read one before rewriting it', async () => {
  const described = describeExistingNotes(['Personal/Budget.md', 'Work/Acme/Renewal.md']);

  assert.match(described, /Personal\/Budget\.md/);
  assert.match(described, /Work\/Acme\/Renewal\.md/);
  assert.match(described, /recall_read_note/);
});

/**
 * The paste version is the same prompt with placeholders filled by hand, for testing in
 * a chat without the server. It is allowed to differ in person ("the user" becomes "I")
 * and in how it asks for output, since it has no tools to call. It is not allowed to
 * quietly lose a rule, which is exactly how it drifted before: it went a whole phase
 * without the Dates section the canonical prompt had.
 */
const PROMPTS = path.join(import.meta.dirname, '..', 'prompts');

const headings = (text: string): string[] =>
  [...text.matchAll(/^## (.+)$/gm)].map((match) => match[1].trim());

/** Collapsed so a phrase still matches when the two files wrap it differently. */
const flatten = (text: string): string => text.replace(/\s+/g, ' ');

test('the paste version covers the same sections as the canonical prompt', async () => {
  const canonical = await fs.readFile(path.join(PROMPTS, 'extraction-prompt.md'), 'utf8');
  const paste = await fs.readFile(path.join(PROMPTS, 'paste-version.md'), 'utf8');

  assert.deepEqual(headings(paste), headings(canonical));
});

test('the paste version keeps every rule the canonical prompt depends on', async () => {
  const canonical = flatten(await fs.readFile(path.join(PROMPTS, 'extraction-prompt.md'), 'utf8'));
  const paste = flatten(await fs.readFile(path.join(PROMPTS, 'paste-version.md'), 'utf8'));

  const rules = [
    '`[decision]`',
    '`[agreed]`',
    '`[suggested]`',
    '`[assumption]`',
    '`[corrected]`',
    '`[context]`',
    '`[claim]`',
    'never record something you generated as something',
    'Enthusiasm is not agreement',
    'choose the weaker one',
    '400 words',
    '12 bullets in any one section',
    'conversation_date',
    'real evidence',
    'durable area of',
    'sibling top-level folders that mean the same thing',
    'updates that note',
  ];

  for (const rule of rules) {
    assert.ok(canonical.includes(rule), `canonical prompt no longer contains "${rule}"`);
    assert.ok(paste.includes(rule), `paste version has drifted, it is missing "${rule}"`);
  }
});

test('asks for a terse report and ends the save there', async () => {
  const prompt = await buildPrompt({
    FOLDER_TREE: 'Work',
    EXISTING_NOTES: 'No notes saved yet.',
    OUTPUT_INSTRUCTION,
  });

  assert.match(prompt, /\(created\)/);
  assert.match(prompt, /\(updated\)/);
  assert.match(prompt, /no reasoning/i);
  assert.match(prompt, /do not offer to save/i);
});

test('has a one line answer for a conversation with nothing worth keeping', async () => {
  assert.match(OUTPUT_INSTRUCTION, /nothing worth saving/i);
  assert.match(OUTPUT_INSTRUCTION, /without listing what you passed over/i);
});

test('assembles the save prompt against a real vault, leaving no placeholder unfilled', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'recall-prompt-'));
  await fs.mkdir(path.join(root, 'Work/Acme'), { recursive: true });
  await fs.writeFile(path.join(root, 'Work/Acme/Renewal.md'), 'x');

  const prompt = await buildSaveMemoryPrompt(root);

  assert.match(prompt, /Work\/Acme/);
  assert.match(prompt, /Work\/Acme\/Renewal\.md/);
  assert.match(prompt, /\(created\)/);
  assert.doesNotMatch(prompt, /\{\{[A-Z_]+\}\}/);
});

test('describes an empty vault as empty in both the tree and the inventory', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'recall-prompt-'));

  const prompt = await buildSaveMemoryPrompt(root);

  assert.match(prompt, /the vault is empty/i);
  assert.match(prompt, /No notes saved yet/i);
  assert.doesNotMatch(prompt, /\{\{[A-Z_]+\}\}/);
});
