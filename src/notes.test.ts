import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { saveNote } from './notes.ts';
import { listFolders } from './vault.ts';

async function emptyVault(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'recall-notes-'));
}

test('writes a note into a folder that does not exist yet', async () => {
  const root = await emptyVault();

  const written = await saveNote(root, {
    folder: 'Work/Acme',
    title: 'Renewal Terms',
    content: '# Renewal Terms\n\nSome findings.\n',
    detail: '# detail\n',
  });

  assert.equal(written.note, 'Work/Acme/Renewal Terms.md');
  assert.ok(
    (await fs.readFile(path.join(root, written.note), 'utf8')).endsWith(
      '# Renewal Terms\n\nSome findings.\n',
    ),
  );
});

test('strips path separators from a title so it cannot create folders', async () => {
  const root = await emptyVault();

  const written = await saveNote(root, {
    folder: 'Work',
    title: 'Q1/Q2 planning: draft',
    content: 'x',
    detail: 'y',
  });

  assert.equal(written.note, 'Work/Q1-Q2 planning- draft.md');
  assert.deepEqual(await fs.readdir(path.join(root, 'Work')), ['Q1-Q2 planning- draft.md']);
});

test('refuses to overwrite an existing note while archiving does not exist', async () => {
  const root = await emptyVault();
  const note = { folder: 'Work', title: 'Notes', content: 'original' };
  await saveNote(root, note);

  await assert.rejects(
    () => saveNote(root, { ...note, content: 'replacement' }),
    /already exists/,
  );
  assert.ok((await fs.readFile(path.join(root, 'Work/Notes.md'), 'utf8')).endsWith('original'));
});

test('refuses a folder that escapes the vault', async () => {
  const root = await emptyVault();

  await assert.rejects(
    () => saveNote(root, { folder: '../escaped', title: 'Notes', content: 'x' }),
    /outside the vault/,
  );
});

test('stamps the dates Recall actually knows, and claims nothing about the conversation', async () => {
  const root = await emptyVault();

  const written = await saveNote(
    root,
    { folder: 'Work', title: 'Notes', content: '# Notes\n\nBody.\n', detail: '# detail\n' },
    { now: new Date('2026-08-30T12:00:00Z') },
  );

  assert.equal(
    await fs.readFile(path.join(root, written.note), 'utf8'),
    '---\nsaved: 2026-08-30\nupdated: 2026-08-30\ndetail: _detail/Work/Notes.md\n---\n\n# Notes\n\nBody.\n',
  );
});

test('records a conversation date only with the basis it was established from', async () => {
  const root = await emptyVault();

  const written = await saveNote(
    root,
    {
      folder: 'Work',
      title: 'Notes',
      content: '# Notes\n',
      detail: '# detail\n',
      conversationDate: '2026-03-14',
      conversationDateBasis: 'user said this thread was from mid-March',
    },
    { now: new Date('2026-08-30T12:00:00Z') },
  );

  const file = await fs.readFile(path.join(root, written.note), 'utf8');
  assert.match(file, /^saved: 2026-08-30$/m);
  assert.match(file, /^conversation_date: 2026-03-14$/m);
  assert.match(file, /^conversation_date_basis: user said this thread was from mid-March$/m);
});

test('refuses a conversation date offered without a basis', async () => {
  const root = await emptyVault();

  await assert.rejects(
    () =>
      saveNote(root, {
        folder: 'Work',
        title: 'Notes',
        content: '# Notes\n',
        conversationDate: '2026-03-14',
      }),
    /basis/,
  );
});

test('refuses a conversation date that is not a plain calendar date', async () => {
  const root = await emptyVault();

  await assert.rejects(
    () =>
      saveNote(root, {
        folder: 'Work',
        title: 'Notes',
        content: '# Notes\n',
        conversationDate: 'a few months ago',
        conversationDateBasis: 'guessed from vibes',
      }),
    /YYYY-MM-DD/,
  );
});

test('writes the readable note and its detail counterpart at mirrored paths', async () => {
  const root = await emptyVault();

  const written = await saveNote(root, {
    folder: 'Work/Acme',
    title: 'Partnership',
    content: '# Partnership\n\nYou walked over the equity split.\n',
    detail: '# Partnership detail\n\n- [decision] Left over equity.\n',
  });

  assert.deepEqual(written, {
    note: 'Work/Acme/Partnership.md',
    detail: '_detail/Work/Acme/Partnership.md',
  });
  assert.match(
    await fs.readFile(path.join(root, written.detail), 'utf8'),
    /- \[decision\] Left over equity\./,
  );
});

test('points each half of the pair at the other so they cannot be read alone', async () => {
  const root = await emptyVault();

  const written = await saveNote(root, {
    folder: 'Work',
    title: 'Partnership',
    content: '# Partnership\n',
    detail: '# detail\n',
  });

  const note = await fs.readFile(path.join(root, written.note), 'utf8');
  const detail = await fs.readFile(path.join(root, written.detail), 'utf8');

  assert.match(note, /^detail: _detail\/Work\/Partnership\.md$/m);
  assert.match(detail, /^note: Work\/Partnership\.md$/m);
});

test('writes neither file when only the detail side already exists', async () => {
  const root = await emptyVault();
  await fs.mkdir(path.join(root, '_detail/Work'), { recursive: true });
  await fs.writeFile(path.join(root, '_detail/Work/Partnership.md'), 'squatter');

  await assert.rejects(
    () => saveNote(root, { folder: 'Work', title: 'Partnership', content: 'x', detail: 'y' }),
    /already exists/,
  );
  await assert.rejects(() => fs.access(path.join(root, 'Work/Partnership.md')));
});

test('keeps the detail tree out of the folders offered to the model', async () => {
  const root = await emptyVault();
  await saveNote(root, { folder: 'Work', title: 'N', content: 'x', detail: 'y' });

  assert.deepEqual(await listFolders(root), ['Work']);
});
