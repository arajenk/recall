import { test } from 'node:test';
import assert from 'node:assert/strict';

import { removeRecallEntry } from './uninstall.ts';
import type { ClaudeConfig } from './setup.ts';

test('removeRecallEntry removes only the recall-vault key', () => {
  const config: ClaudeConfig = {
    mcpServers: {
      'recall-vault': { command: '/usr/local/bin/recall-vault', args: [] },
      'some-other-server': { command: '/bin/other', args: ['--flag'] },
    },
  };
  const result = removeRecallEntry(config);
  assert.deepEqual(result.mcpServers, {
    'some-other-server': { command: '/bin/other', args: ['--flag'] },
  });
});

test('removeRecallEntry is a no-op when recall-vault is not present', () => {
  const config: ClaudeConfig = {
    mcpServers: {
      'some-other-server': { command: '/bin/other', args: [] },
    },
  };
  const result = removeRecallEntry(config);
  assert.deepEqual(result.mcpServers, {
    'some-other-server': { command: '/bin/other', args: [] },
  });
});

test('removeRecallEntry handles a config with no mcpServers at all', () => {
  const config: ClaudeConfig = {};
  const result = removeRecallEntry(config);
  assert.deepEqual(result.mcpServers, {});
});
