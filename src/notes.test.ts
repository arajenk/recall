import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { saveNote, readNote, updateNote } from './notes.ts';
import { listFolders } from './vault.ts';

async function emptyVault(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'recall-notes-'));
}

async function exists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
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

test('refuses to overwrite an existing note, pointing at the update path instead', async () => {
  const root = await emptyVault();
  const note = { folder: 'Work', title: 'Notes', content: 'original' };
  await saveNote(root, note);

  await assert.rejects(
    () => saveNote(root, { ...note, content: 'replacement' }),
    /already exists.*update tool/s,
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

test('reads back both halves of a pair without the frontmatter', async () => {
  const root = await emptyVault();
  await saveNote(root, {
    folder: 'Work',
    title: 'Renewal',
    content: '# Renewal\n\nThe readable half.\n',
    detail: '# Renewal\n\n- [decision] the detail half\n',
  });

  const read = await readNote(root, 'Work/Renewal.md');

  assert.equal(read.content, '# Renewal\n\nThe readable half.\n');
  assert.equal(read.detail, '# Renewal\n\n- [decision] the detail half\n');
});

test('refuses to read a note whose detail half is missing', async () => {
  const root = await emptyVault();
  await saveNote(root, { folder: 'Work', title: 'Renewal', content: 'a', detail: 'b' });
  await fs.rm(path.join(root, '_detail/Work/Renewal.md'));

  await assert.rejects(() => readNote(root, 'Work/Renewal.md'), /_detail\/Work\/Renewal\.md/);
});

test('refuses to read a note that is not there', async () => {
  const root = await emptyVault();

  await assert.rejects(() => readNote(root, 'Work/Missing.md'), /no note at/i);
});

test('refuses to read a path that escapes the vault', async () => {
  const root = await emptyVault();

  await assert.rejects(() => readNote(root, '../../.ssh/id_rsa'), /outside the vault/);
});

const SAVED_AT = new Date('2026-03-01T10:00:00Z');
const UPDATED_AT = new Date('2026-08-31T19:22:00Z');

async function savedPair(root: string) {
  return saveNote(
    root,
    {
      folder: 'Work',
      title: 'Renewal',
      content: '# Renewal\n\nThe original readable half.\n',
      detail: '# Renewal\n\n- [decision] the original detail\n',
    },
    { now: SAVED_AT },
  );
}

test('keeps the date the note was first saved and moves only the updated date', async () => {
  const root = await emptyVault();
  await savedPair(root);

  await updateNote(
    root,
    {
      path: 'Work/Renewal.md',
      content: '# Renewal\n\nThe original readable half, and a rewritten ending.\n',
      detail: '# Renewal\n\n- [decision] the original detail, still here\n',
    },
    { now: UPDATED_AT },
  );

  const raw = await fs.readFile(path.join(root, 'Work/Renewal.md'), 'utf8');
  assert.match(raw, /saved: 2026-03-01/);
  assert.match(raw, /updated: 2026-08-31/);
});

test('archives the text of both halves as they were before the update', async () => {
  const root = await emptyVault();
  await savedPair(root);

  const written = await updateNote(
    root,
    {
      path: 'Work/Renewal.md',
      content: '# Renewal\n\nThe original readable half, now with more. Rewritten.\n',
      detail: '# Renewal\n\n- [decision] the original detail, plus a new bullet\n',
    },
    { now: UPDATED_AT },
  );

  const archivedNote = await fs.readFile(path.join(root, written.archived.note), 'utf8');
  const archivedDetail = await fs.readFile(path.join(root, written.archived.detail), 'utf8');
  assert.match(archivedNote, /The original readable half/);
  assert.match(archivedDetail, /the original detail/);
  assert.match(
    await fs.readFile(path.join(root, 'Work/Renewal.md'), 'utf8'),
    /Rewritten/,
  );
});

test('keeps every earlier version rather than replacing the last archive entry', async () => {
  const root = await emptyVault();
  await savedPair(root);
  const first = await updateNote(
    root,
    {
      path: 'Work/Renewal.md',
      content: '# Renewal\n\nThe original readable half, second pass.\n',
      detail: '# Renewal\n\n- [decision] the original detail, second pass\n',
    },
    { now: UPDATED_AT },
  );
  const second = await updateNote(
    root,
    {
      path: 'Work/Renewal.md',
      content: '# Renewal\n\nThe original readable half, third pass.\n',
      detail: '# Renewal\n\n- [decision] the original detail, third pass\n',
    },
    { now: new Date('2026-09-01T08:00:00Z') },
  );

  assert.notEqual(first.archived.note, second.archived.note);
  const versions = await fs.readdir(path.join(root, '.recall/archive/Work/Renewal'));
  assert.equal(versions.length, 2);
});

test('refuses to update a note that was never saved', async () => {
  const root = await emptyVault();

  await assert.rejects(
    () => updateNote(root, { path: 'Work/Missing.md', content: 'a', detail: 'b' }),
    /no note at/i,
  );
});

test('leaves the readable half at its original text when the detail half cannot be written', async () => {
  const root = await emptyVault();
  await savedPair(root);
  const detailPath = path.join(root, '_detail/Work/Renewal.md');
  await fs.chmod(detailPath, 0o444);

  await assert.rejects(() =>
    updateNote(
      root,
      { path: 'Work/Renewal.md', content: 'rewritten', detail: 'rewritten detail' },
      { now: UPDATED_AT },
    ),
  );

  await fs.chmod(detailPath, 0o644);
  assert.match(
    await fs.readFile(path.join(root, 'Work/Renewal.md'), 'utf8'),
    /The original readable half/,
  );
});

test('carries the conversation date forward instead of dropping it on update', async () => {
  const root = await emptyVault();
  await saveNote(
    root,
    {
      folder: 'Work',
      title: 'Renewal',
      content: 'a',
      detail: 'b',
      conversationDate: '2026-02-14',
      conversationDateBasis: 'the user said this thread was from Valentine\'s Day',
    },
    { now: SAVED_AT },
  );

  await updateNote(
    root,
    { path: 'Work/Renewal.md', content: 'c', detail: 'd' },
    { now: UPDATED_AT },
  );

  const raw = await fs.readFile(path.join(root, 'Work/Renewal.md'), 'utf8');
  assert.match(raw, /conversation_date: 2026-02-14/);
  assert.match(raw, /conversation_date_basis: the user said/);
});

test('explains a collision even when two saves of one title race each other', async () => {
  const root = await emptyVault();
  const note = { folder: 'Work', title: 'Renewal', content: 'a', detail: 'b' };

  const results = await Promise.allSettled([saveNote(root, note), saveNote(root, note)]);
  const rejected = results.filter((r) => r.status === 'rejected');

  assert.equal(rejected.length, 1);
  assert.match((rejected[0] as PromiseRejectedResult).reason.message, /already exists.*update tool/s);
});

test('lets an update through when it keeps what was already in the note', async () => {
  const root = await emptyVault();
  await savedPair(root);

  const written = await updateNote(
    root,
    {
      path: 'Work/Renewal.md',
      content: '# Renewal\n\nThe original readable half, plus a new paragraph about terms.\n',
      detail: '# Renewal\n\n- [decision] the original detail\n- [decision] and a new one\n',
    },
    { now: UPDATED_AT },
  );

  assert.equal(written.note, 'Work/Renewal.md');
});

test('refuses an update that quietly drops most of a note', async () => {
  const root = await emptyVault();
  await savedPair(root);

  await assert.rejects(
    () =>
      updateNote(
        root,
        { path: 'Work/Renewal.md', content: '# Renewal\n\nShort.\n', detail: '# d\n' },
        { now: UPDATED_AT },
      ),
    /would drop.*say why/s,
  );
});

test('leaves the note untouched when it refuses a shrinking update', async () => {
  const root = await emptyVault();
  await savedPair(root);

  await assert.rejects(() =>
    updateNote(
      root,
      { path: 'Work/Renewal.md', content: 'gone', detail: 'gone' },
      { now: UPDATED_AT },
    ),
  );

  const raw = await fs.readFile(path.join(root, 'Work/Renewal.md'), 'utf8');
  assert.match(raw, /The original readable half/);
  assert.equal(await exists(path.join(root, '.recall/archive/Work/Renewal')), false);
});

test('allows a shrinking update once it says what it is dropping and why', async () => {
  const root = await emptyVault();
  await savedPair(root);

  const written = await updateNote(
    root,
    {
      path: 'Work/Renewal.md',
      content: '# Renewal\n\nShort.\n',
      detail: '# d\n',
      dropping: 'the pricing thread was a dead end raised and abandoned in this conversation',
    },
    { now: UPDATED_AT },
  );

  assert.match(await fs.readFile(path.join(root, written.note), 'utf8'), /Short/);
});
