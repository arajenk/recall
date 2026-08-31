import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { resolveInVault, listFolders } from './vault.ts';

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
