import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  getConfigPath,
  isConfigPathPlausible,
  mergeRecallEntry,
  readConfig,
  backupConfig,
  manualConfigBlock,
  type ClaudeConfig,
} from './setup.ts';

test('getConfigPath resolves the macOS path', () => {
  const result = getConfigPath('darwin');
  assert.ok(result.endsWith(path.join('Library', 'Application Support', 'Claude', 'claude_desktop_config.json')));
});

test('getConfigPath resolves the Windows path under APPDATA', () => {
  const originalAppData = process.env.APPDATA;
  process.env.APPDATA = 'C:\\Users\\test\\AppData\\Roaming';
  try {
    const result = getConfigPath('win32');
    assert.equal(result, path.join('C:\\Users\\test\\AppData\\Roaming', 'Claude', 'claude_desktop_config.json'));
  } finally {
    if (originalAppData === undefined) delete process.env.APPDATA;
    else process.env.APPDATA = originalAppData;
  }
});

test('getConfigPath resolves the Linux path under ~/.config', () => {
  const result = getConfigPath('linux');
  assert.ok(result.endsWith(path.join('.config', 'Claude', 'claude_desktop_config.json')));
});

test('isConfigPathPlausible is always true on darwin, even for a nonexistent path', async () => {
  const result = await isConfigPathPlausible('/definitely/not/a/real/path/claude_desktop_config.json', 'darwin');
  assert.equal(result, true);
});

test('isConfigPathPlausible is false on linux/win32 when the parent directory is missing', async () => {
  const result = await isConfigPathPlausible('/definitely/not/a/real/path/claude_desktop_config.json', 'linux');
  assert.equal(result, false);
});

test('isConfigPathPlausible is true on linux/win32 when the parent directory exists', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'recall-setup-test-'));
  const configPath = path.join(root, 'claude_desktop_config.json');
  const result = await isConfigPathPlausible(configPath, 'linux');
  assert.equal(result, true);
});

test('mergeRecallEntry adds a recall-vault entry to an empty config', () => {
  const config: ClaudeConfig = { mcpServers: {} };
  const result = mergeRecallEntry(config, '/usr/local/bin/recall-vault');
  assert.deepEqual(result.mcpServers?.['recall-vault'], {
    command: '/usr/local/bin/recall-vault',
    args: [],
  });
});

test('mergeRecallEntry preserves other server entries', () => {
  const config: ClaudeConfig = {
    mcpServers: {
      'some-other-server': { command: '/bin/other', args: ['--flag'] },
    },
  };
  const result = mergeRecallEntry(config, '/usr/local/bin/recall-vault');
  assert.deepEqual(result.mcpServers?.['some-other-server'], {
    command: '/bin/other',
    args: ['--flag'],
  });
  assert.deepEqual(result.mcpServers?.['recall-vault'], {
    command: '/usr/local/bin/recall-vault',
    args: [],
  });
});

test('mergeRecallEntry is idempotent: re-running replaces the entry in place', () => {
  const config: ClaudeConfig = {
    mcpServers: {
      'recall-vault': { command: '/old/stale/path', args: [] },
      'some-other-server': { command: '/bin/other', args: [] },
    },
  };
  const result = mergeRecallEntry(config, '/new/bin/path');
  const keys = Object.keys(result.mcpServers ?? {});
  assert.equal(keys.filter((key) => key === 'recall-vault').length, 1);
  assert.deepEqual(result.mcpServers?.['recall-vault'], {
    command: '/new/bin/path',
    args: [],
  });
  assert.deepEqual(result.mcpServers?.['some-other-server'], {
    command: '/bin/other',
    args: [],
  });
});

test('readConfig returns an empty mcpServers object when the file does not exist', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'recall-setup-test-'));
  const configPath = path.join(root, 'claude_desktop_config.json');
  const result = await readConfig(configPath);
  assert.deepEqual(result, { mcpServers: {} });
});

test('readConfig parses an existing valid config file', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'recall-setup-test-'));
  const configPath = path.join(root, 'claude_desktop_config.json');
  await fs.writeFile(configPath, JSON.stringify({ mcpServers: { foo: { command: 'bar', args: [] } } }));
  const result = await readConfig(configPath);
  assert.deepEqual(result, { mcpServers: { foo: { command: 'bar', args: [] } } });
});

test('readConfig throws on a file that is not valid JSON', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'recall-setup-test-'));
  const configPath = path.join(root, 'claude_desktop_config.json');
  await fs.writeFile(configPath, '{ not valid json');
  await assert.rejects(() => readConfig(configPath));
});

test('backupConfig copies an existing file to a timestamped .bak path', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'recall-setup-test-'));
  const configPath = path.join(root, 'claude_desktop_config.json');
  await fs.writeFile(configPath, '{"mcpServers":{}}');

  await backupConfig(configPath);

  const entries = await fs.readdir(root);
  const backups = entries.filter((name) => name.startsWith('claude_desktop_config.json.bak-'));
  assert.equal(backups.length, 1);
  const backupContent = await fs.readFile(path.join(root, backups[0]), 'utf8');
  assert.equal(backupContent, '{"mcpServers":{}}');
});

test('backupConfig does nothing when there is no existing file', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'recall-setup-test-'));
  const configPath = path.join(root, 'claude_desktop_config.json');

  await backupConfig(configPath); // must not throw

  const entries = await fs.readdir(root);
  assert.deepEqual(entries, []);
});

test('manualConfigBlock prints valid JSON containing the given bin path', () => {
  const block = manualConfigBlock('/usr/local/bin/recall-vault');
  const parsed = JSON.parse(block);
  assert.deepEqual(parsed, {
    mcpServers: {
      'recall-vault': { command: '/usr/local/bin/recall-vault', args: [] },
    },
  });
});
