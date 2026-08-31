import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { resolveInVault, listFolders, listNotes } from './vault.ts';

async function makeVault(folders: string[]): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'recall-test-'));
  for (const folder of folders) {
    await fs.mkdir(path.join(root, folder), { recursive: true });
  }
  return root;
}

test('resolves a folder path to an absolute path inside the vault', () => {
  const resolved = resolveInVault('/Users/someone/Recall', 'Work/Acme');

  assert.equal(resolved, '/Users/someone/Recall/Work/Acme');
});

test('rejects a relative path that climbs out of the vault', () => {
  assert.throws(
    () => resolveInVault('/Users/someone/Recall', '../../.ssh/id_rsa'),
    /outside the vault/,
  );
});

test('rejects an absolute path pointing outside the vault', () => {
  assert.throws(
    () => resolveInVault('/Users/someone/Recall', '/etc/passwd'),
    /outside the vault/,
  );
});

test('rejects a sibling folder whose name merely starts with the vault name', () => {
  assert.throws(
    () => resolveInVault('/Users/someone/Recall', '../RecallElsewhere/note.md'),
    /outside the vault/,
  );
});

test('lists nested folders as relative paths, deepest last', async () => {
  const root = await makeVault(['Work/Acme', 'Content']);

  assert.deepEqual(await listFolders(root), ['Content', 'Work', 'Work/Acme']);
});

test('hides the .recall bookkeeping folder from the model', async () => {
  const root = await makeVault(['Work', '.recall/archive/Work']);

  assert.deepEqual(await listFolders(root), ['Work']);
});

test('reports an empty vault as no folders at all', async () => {
  const root = await makeVault([]);

  assert.deepEqual(await listFolders(root), []);
});

test('lists every note in the vault as a relative path', async () => {
  const root = await makeVault(['Work/Acme', 'Personal']);
  await fs.writeFile(path.join(root, 'Work/Acme/Renewal.md'), 'x');
  await fs.writeFile(path.join(root, 'Personal/Budget.md'), 'y');

  assert.deepEqual(await listNotes(root), ['Personal/Budget.md', 'Work/Acme/Renewal.md']);
});

test('keeps the detail half and the archive out of the notes offered to the model', async () => {
  const root = await makeVault(['Work', '_detail/Work', '.recall/archive/Work/Renewal']);
  await fs.writeFile(path.join(root, 'Work/Renewal.md'), 'x');
  await fs.writeFile(path.join(root, '_detail/Work/Renewal.md'), 'x');
  await fs.writeFile(path.join(root, '.recall/archive/Work/Renewal/2026-01-01T000000Z.md'), 'x');

  assert.deepEqual(await listNotes(root), ['Work/Renewal.md']);
});

test('ignores files in the vault that are not notes', async () => {
  const root = await makeVault(['Work']);
  await fs.writeFile(path.join(root, 'Work/Renewal.md'), 'x');
  await fs.writeFile(path.join(root, 'Work/.DS_Store'), 'junk');
  await fs.writeFile(path.join(root, 'Work/diagram.png'), 'junk');

  assert.deepEqual(await listNotes(root), ['Work/Renewal.md']);
});
