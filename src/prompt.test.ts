import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildPrompt } from './prompt.ts';

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
