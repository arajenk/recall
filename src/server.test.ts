import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { createServer } from './server.ts';
import { saveNote } from './notes.ts';

async function tempVault(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'recall-server-test-'));
}

/**
 * Connects a client straight to the server over an in-memory pair, so the tool
 * surface can be checked the way a real client sees it. Importing this file used
 * to start a stdio server, which is why none of it was covered before. Uses an
 * isolated temp vault, since building the standing list now reads the vault for
 * real at construction time.
 */
async function connect(vaultRoot?: string): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '1' });
  const server = await createServer(vaultRoot ?? (await tempVault()));
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

function text(result: any): string {
  return (result.content as Array<{ type: string; text?: string }>)
    .map((block) => block.text ?? '')
    .join('\n');
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

test('names an existing note in the standing list, so recall_search is on the radar unprompted', async () => {
  const root = await tempVault();
  await saveNote(root, {
    folder: 'Work/Acme',
    title: 'Renewal terms',
    content: '# Renewal terms\n\nAcme wants a three year term.\n',
    detail: '# Renewal terms\n\n- [decision] Three years.\n',
  });

  const client = await connect(root);
  const tools = (await client.listTools()).tools;
  const description = tools.find((tool) => tool.name === 'recall_search')?.description ?? '';

  assert.match(description, /Work\/Acme\/Renewal terms/);
});

test('recall_search returns a capped shortlist, not the note itself', async () => {
  const root = await tempVault();
  await saveNote(root, {
    folder: 'Work/Acme',
    title: 'Renewal terms',
    content: '# Renewal terms\n\nAcme wants a three year term instead of one.\n',
    detail: '# Renewal terms\n\n- [decision] Three years.\n',
  });

  const client = await connect(root);
  const result = await client.callTool({ name: 'recall_search', arguments: { query: 'renewal' } });
  const output = text(result);

  assert.match(output, /Work\/Acme\/Renewal terms\.md/);
  assert.match(output, /saved \d{4}-\d{2}-\d{2}/);
  assert.match(output, /Acme wants a three year term instead of one/);
});

test('recall_search says plainly when nothing matches, rather than guessing', async () => {
  const client = await connect();
  const result = await client.callTool({
    name: 'recall_search',
    arguments: { query: 'something not in the vault' },
  });

  assert.match(text(result), /no matching notes/i);
});

test('recall_search steers a reconciliation question at recall_context, not straight to recall_read_note', async () => {
  const client = await connect();
  const tools = (await client.listTools()).tools;
  const search = tools.find((tool) => tool.name === 'recall_search')?.description ?? '';
  const readNote = tools.find((tool) => tool.name === 'recall_read_note')?.description ?? '';

  assert.match(search, /call `recall_context`/i);
  assert.match(readNote, /prefer `recall_context`/i);
});

test('recall_context returns the detail half, with dates, not the readable half', async () => {
  const root = await tempVault();
  await saveNote(root, {
    folder: 'Work/Acme',
    title: 'Renewal terms',
    content: '# Renewal terms\n\nAcme wants a three year term.\n',
    detail: '# Renewal terms\n\n- [decision] Three years. (evidence: user said so)\n',
  });

  const client = await connect(root);
  const result = await client.callTool({
    name: 'recall_context',
    arguments: { paths: ['Work/Acme/Renewal terms.md'] },
  });
  const output = text(result);

  assert.match(output, /\[decision\] Three years/);
  assert.match(output, /saved \d{4}-\d{2}-\d{2}/);
  assert.doesNotMatch(output, /Acme wants a three year term\./);
});

test('recall_context reports a bad path inline instead of failing the whole call', async () => {
  const client = await connect();
  const result = await client.callTool({
    name: 'recall_context',
    arguments: { paths: ['Nothing/Here.md'] },
  });

  assert.match(text(result), /no note at/i);
});

test('recall_context describes how to resolve conflicting notes, since it does the reasoning', async () => {
  const client = await connect();
  const tools = (await client.listTools()).tools;
  const description = tools.find((tool) => tool.name === 'recall_context')?.description ?? '';

  assert.match(description, /what the user says right now outranks/i);
  assert.match(description, /decision.*outranks.*agreement.*outranks.*suggestion/is);
  assert.match(description, /\[superseded\]/);
  assert.match(description, /never a live candidate/i);
});

test('recall_read_note never hands back a heading that could be mistaken for note content', async () => {
  const root = await tempVault();
  await saveNote(root, {
    folder: 'Work/Acme',
    title: 'Renewal terms',
    content: '# Renewal terms\n\nAcme wants a three year term.\n',
    detail: '# Renewal terms\n\n- [decision] Three years.\n',
  });

  const client = await connect(root);
  const result = await client.callTool({
    name: 'recall_read_note',
    arguments: { path: 'Work/Acme/Renewal terms.md' },
  });
  const output = text(result);

  /**
   * This is the actual regression: recall_read_note used to concatenate both
   * halves into one block of text with a "## detail" heading marking the
   * boundary. A whole-text rewrite of the readable half, built from that
   * response, could drag the heading and everything after it into what got
   * submitted as `content`, writing the detail half straight into the note
   * the user reads. Six real notes in the vault were found corrupted this
   * exact way. The fix is the read response never containing that heading at
   * all, backed by notes.ts refusing a heading in content outright.
   */
  assert.doesNotMatch(output, /^##\s+detail/im);
  assert.match(output, /pass back only this text as `content`/);
  assert.match(output, /pass back only this text as `detail`/);
  assert.match(output, /never merged into `content`/);
});

test('recall_update_note applies a targeted edit end to end, through the real tool schema', async () => {
  const root = await tempVault();
  await saveNote(root, {
    folder: 'Work/Acme',
    title: 'Renewal terms',
    content: '# Renewal terms\n\nAcme wants a three year term.\n',
    detail: '# Renewal terms\n\n- [decision] Three years.\n',
  });

  const client = await connect(root);
  const result = await client.callTool({
    name: 'recall_update_note',
    arguments: {
      path: 'Work/Acme/Renewal terms.md',
      detail_edits: [{ old_str: '- [decision] Three years.\n', new_str: '- [decision] Three years.\n- [decision] Signed.\n' }],
    },
  });

  assert.doesNotMatch(text(result).toLowerCase(), /error|refus|could not find/);
  const note = await fs.readFile(path.join(root, 'Work/Acme/Renewal terms.md'), 'utf8');
  const detail = await fs.readFile(path.join(root, '_detail/Work/Acme/Renewal terms.md'), 'utf8');
  assert.match(note, /Acme wants a three year term\./);
  assert.match(detail, /Signed/);
});

test('recall_update_note rejects an edit that does not match the note verbatim', async () => {
  const root = await tempVault();
  await saveNote(root, {
    folder: 'Work/Acme',
    title: 'Renewal terms',
    content: '# Renewal terms\n\nAcme wants a three year term.\n',
    detail: '# Renewal terms\n\n- [decision] Three years.\n',
  });

  const client = await connect(root);
  const result = await client.callTool({
    name: 'recall_update_note',
    arguments: {
      path: 'Work/Acme/Renewal terms.md',
      detail_edits: [{ old_str: 'not actually in the note', new_str: 'x' }],
    },
  });

  assert.equal(result.isError, true);
  assert.match(text(result), /Could not find the text to replace/);
});

test('recall_update_note rejects an edit with an empty old_str before it ever reaches applyEdits', async () => {
  const root = await tempVault();
  await saveNote(root, {
    folder: 'Work/Acme',
    title: 'Renewal terms',
    content: '# Renewal terms\n\nAcme wants a three year term.\n',
    detail: '# Renewal terms\n\n- [decision] Three years.\n',
  });

  const client = await connect(root);
  const result = await client.callTool({
    name: 'recall_update_note',
    arguments: {
      path: 'Work/Acme/Renewal terms.md',
      detail_edits: [{ old_str: '', new_str: 'x' }],
    },
  });

  assert.equal(result.isError, true);
  assert.match(text(result), /old_str cannot be empty/);
});

