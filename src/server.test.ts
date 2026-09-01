import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { createServer } from './server.ts';

/**
 * Connects a client straight to the server over an in-memory pair, so the tool
 * surface can be checked the way a real client sees it. Importing this file used
 * to start a stdio server, which is why none of it was covered before.
 */
async function connect(): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '1' });
  await Promise.all([createServer().connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

test('offers both ways into a save, so neither entry point is the only one', async () => {
  const client = await connect();

  const tools = (await client.listTools()).tools.map((tool) => tool.name);
  const prompts = (await client.listPrompts()).prompts.map((prompt) => prompt.name);

  assert.ok(tools.includes('recall_save_conversation'));
  assert.ok(prompts.includes('save-memory'));
});

test('sends a save that starts at a write tool back to the instructions first', async () => {
  const client = await connect();
  const tools = (await client.listTools()).tools;

  for (const name of ['recall_save_note', 'recall_update_note']) {
    const description = tools.find((tool) => tool.name === name)?.description ?? '';
    assert.match(
      description,
      /recall_save_conversation/,
      `${name} does not point back at the instructions, so a typed save can skip them`,
    );
  }
});

test('describes the save tool in the words a user would actually say', async () => {
  const client = await connect();
  const tools = (await client.listTools()).tools;

  const description = tools.find((tool) => tool.name === 'recall_save_conversation')?.description ?? '';
  for (const phrasing of ['save this', 'remember this']) {
    assert.match(description, new RegExp(phrasing, 'i'));
  }
});
