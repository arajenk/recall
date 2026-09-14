import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { saveNote } from './notes.ts';
import { listNoteTitles, searchNotes } from './search.ts';

async function tempVault(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'recall-search-test-'));
}

test('lists titles with no folder or extension, for the standing list', async () => {
  const root = await tempVault();
  await saveNote(root, {
    folder: 'Work/Acme',
    title: 'Renewal terms',
    content: '# Renewal terms\n\nAcme wants a three year term.\n',
    detail: '# Renewal terms\n\n- [decision] Three years. (evidence: user said so)\n',
  });

  assert.deepEqual(await listNoteTitles(root), ['Work/Acme/Renewal terms']);
});

test('reports an empty vault with no titles at all', async () => {
  const root = await tempVault();
  assert.deepEqual(await listNoteTitles(root), []);
});

test('matches on the note body, not just the title', async () => {
  const root = await tempVault();
  await saveNote(root, {
    folder: 'Work/Acme',
    title: 'Renewal terms',
    content: '# Renewal terms\n\nAcme wants a three year term instead of one.\n',
    detail: '# Renewal terms\n\n- [decision] Three years. (evidence: user said so)\n',
  });

  const matches = await searchNotes(root, 'three year');
  assert.equal(matches.length, 1);
  assert.equal(matches[0].path, 'Work/Acme/Renewal terms.md');
});

test('requires every search term to match, not just one', async () => {
  const root = await tempVault();
  await saveNote(root, {
    folder: 'Work/Acme',
    title: 'Renewal terms',
    content: '# Renewal terms\n\nAcme wants a three year term.\n',
    detail: '# Renewal terms\n\n- [decision] Three years.\n',
  });

  assert.deepEqual(await searchNotes(root, 'three decade'), []);
});

test('returns no matches for a subject the vault has nothing on', async () => {
  const root = await tempVault();
  await saveNote(root, {
    folder: 'Work/Acme',
    title: 'Renewal terms',
    content: '# Renewal terms\n\nAcme wants a three year term.\n',
    detail: '# Renewal terms\n\n- [decision] Three years.\n',
  });

  assert.deepEqual(await searchNotes(root, 'lucent delivery spending'), []);
});

test('builds the gist from the note heading and its opening line', async () => {
  const root = await tempVault();
  await saveNote(root, {
    folder: 'Work/Acme',
    title: 'Renewal terms',
    content: '# Renewal terms\n\nAcme wants a three year term instead of one.\n',
    detail: '# Renewal terms\n\n- [decision] Three years.\n',
  });

  const [match] = await searchNotes(root, 'renewal');
  assert.equal(match.gist, 'Renewal terms: Acme wants a three year term instead of one.');
});

test('carries the saved and updated dates through to the summary', async () => {
  const root = await tempVault();
  const now = new Date('2026-03-01T00:00:00Z');
  await saveNote(
    root,
    {
      folder: 'Work/Acme',
      title: 'Renewal terms',
      content: '# Renewal terms\n\nAcme wants a three year term.\n',
      detail: '# Renewal terms\n\n- [decision] Three years.\n',
    },
    { now },
  );

  const [match] = await searchNotes(root, 'renewal');
  assert.equal(match.saved, '2026-03-01');
  assert.equal(match.updated, '2026-03-01');
});

test('caps results rather than returning every match in a large vault', async () => {
  const root = await tempVault();
  for (let i = 0; i < 8; i += 1) {
    await saveNote(root, {
      folder: 'Work/Acme',
      title: `Meeting ${i}`,
      content: `# Meeting ${i}\n\nAcme discussed the roadmap.\n`,
      detail: `# Meeting ${i}\n\n- [decision] Roadmap item ${i}.\n`,
    });
  }

  const matches = await searchNotes(root, 'acme');
  assert.equal(matches.length, 5);
});
