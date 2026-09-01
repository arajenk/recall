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

  /**
   * "remember this" is deliberately absent. Tested against the real client, that
   * phrasing goes to its own built-in memory whatever this description says, and
   * claiming it here only teaches the model a rule it cannot keep.
   */
  for (const phrasing of ['save this to recall', 'save this', 'save it']) {
    assert.match(description, new RegExp(phrasing, 'i'));
  }
});

test('separates Recall from the built in memory the client already has', async () => {
  const client = await connect();
  const tools = (await client.listTools()).tools;

  /**
   * "Remember this" is a fair way to ask for either one. Every tool has to say
   * which it is, or the save quietly lands somewhere the user cannot open.
   */
  for (const tool of tools) {
    assert.match(
      tool.description ?? '',
      /NOT Claude's built-in memory/,
      `${tool.name} does not distinguish itself from the client's own memory`,
    );
  }
});

test('treats a bare save request as being about the conversation itself', async () => {
  const client = await connect();
  const tools = (await client.listTools()).tools;
  const description = tools.find((t) => t.name === 'recall_save_conversation')?.description ?? '';

  /**
   * Observed: "save this to recall" fires, "save this" makes the model ask what
   * to save. The object is always the conversation, so the description has to
   * say so rather than leaving the model to infer it from examples.
   */
  assert.match(description, /do not ask what they mean/i);
  assert.match(description, /the conversation itself/i);
});
