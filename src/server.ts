#!/usr/bin/env node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { listFolders } from './vault.ts';
import { saveNote } from './notes.ts';
import { buildPrompt } from './prompt.ts';
import { log } from './log.ts';

const VAULT_ROOT = process.env.RECALL_VAULT ?? path.join(os.homedir(), 'Recall');

const EMPTY_TREE = '(none yet, the vault is empty)';

/**
 * Phase 2 is create-only. Saying so in the prompt keeps the model from trying to
 * merge into a note it cannot yet read.
 */
const NO_EXISTING_NOTES =
  'Updating existing notes is not supported yet. Treat every note as new. ' +
  'If a note already exists at the path you choose, the save will fail and you should report that.';

const OUTPUT_INSTRUCTION =
  'Call `recall_save_note` once for each note you decided to write, passing both halves ' +
  '(`content` and `detail`) in the same call. Do not print the notes into the chat. The ' +
  'tool is what files them. After the calls, reply with one short line per note saying ' +
  'where it was filed, and flag any folder you created.';

export function createServer(): McpServer {
  const server = new McpServer({ name: 'recall', version: '0.1.0' });

  server.registerTool(
    'recall_list_vault',
    {
      title: 'List the Recall vault',
      description:
        "Lists the folders in the user's own Recall vault. A plain folder of markdown " +
        "notes on their disk. This is NOT Claude's built-in memory. Call this before " +
        'choosing where to file a note, so notes land in folders that already exist.',
      inputSchema: {},
    },
    async () => {
      log(VAULT_ROOT, 'recall_list_vault called');
      const folders = await listFolders(VAULT_ROOT);
      log(VAULT_ROOT, `recall_list_vault returned ${folders.length} folder(s)`);
      return {
        content: [{ type: 'text', text: folders.length ? folders.join('\n') : EMPTY_TREE }],
      };
    },
  );

  server.registerTool(
    'recall_save_note',
    {
      title: 'Save a note to the Recall vault',
      description:
        "Writes one markdown note into the user's own Recall vault on their disk. This " +
        "is NOT Claude's built-in memory. Call once per note. Refuses to overwrite an " +
        'existing note.',
      inputSchema: {
        folder: z
          .string()
          .describe('Vault-relative folder, e.g. "Work/Acme". Nested paths are real subfolders.'),
        title: z.string().describe('Short specific title; becomes the filename.'),
        content: z
          .string()
          .describe(
            'The READABLE note: prose the user reads start to finish, written to them as ' +
              '"you", no bracket tags, under 400 words. Starts with its "# " heading.',
          ),
        detail: z
          .string()
          .describe(
            'The DETAIL counterpart, filed out of the way: tagged bullets ([decision], ' +
              '[agreed], [suggested], [assumption], [corrected]) with evidence and ' +
              'confidence. Precision over readability. Starts with its "# " heading.',
          ),
        conversation_date: z
          .string()
          .optional()
          .describe(
            'ONLY when you have real evidence of when this conversation happened: the ' +
              'user stated it, or the conversation contains dated content. You cannot see ' +
              'message timestamps, and today\'s date is not evidence about an older thread. ' +
              'Omit when unknown; never guess. Format YYYY-MM-DD.',
          ),
        conversation_date_basis: z
          .string()
          .optional()
          .describe(
            'How you established conversation_date, e.g. "user said this thread was from ' +
              'mid-March". Required whenever conversation_date is given.',
          ),
      },
    },
    async ({ folder, title, content, detail, conversation_date, conversation_date_basis }) => {
      log(
        VAULT_ROOT,
        `recall_save_note called: folder=${folder} title=${title} ` +
          `content=${content?.length ?? 0}b detail=${detail?.length ?? 0}b`,
      );
      try {
        const written = await saveNote(VAULT_ROOT, {
          folder,
          title,
          content,
          detail,
          conversationDate: conversation_date,
          conversationDateBasis: conversation_date_basis,
        });
        log(VAULT_ROOT, `recall_save_note wrote ${written.note}`);
        return {
          content: [{ type: 'text', text: `Saved to ${written.note} (detail: ${written.detail})` }],
        };
      } catch (error) {
        log(VAULT_ROOT, `recall_save_note failed: ${(error as Error).message}`);
        return {
          isError: true,
          content: [{ type: 'text', text: (error as Error).message }],
        };
      }
    },
  );

  server.registerPrompt(
    'save-memory',
    {
      title: 'Save this conversation to Recall',
      description:
        'Extracts what is worth remembering from this conversation and files it as ' +
        "markdown notes in the user's Recall vault.",
      argsSchema: {},
    },
    async () => {
      const folders = await listFolders(VAULT_ROOT);
      const text = await buildPrompt({
        FOLDER_TREE: folders.length ? folders.join('\n') : EMPTY_TREE,
        EXISTING_NOTES: NO_EXISTING_NOTES,
        OUTPUT_INSTRUCTION,
      });

      return { messages: [{ role: 'user', content: { type: 'text', text } }] };
    },
  );

  return server;
}

async function main(): Promise<void> {
  await fs.mkdir(VAULT_ROOT, { recursive: true });
  log(VAULT_ROOT, `server starting (pid ${process.pid}, vault ${VAULT_ROOT})`);
  await createServer().connect(new StdioServerTransport());
  log(VAULT_ROOT, `server connected (pid ${process.pid})`);
}

main().catch((error) => {
  console.error('recall failed to start:', error);
  process.exit(1);
});
