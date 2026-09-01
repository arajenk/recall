#!/usr/bin/env node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { listFolders } from './vault.ts';
import { saveNote, readNote, updateNote } from './notes.ts';
import { buildSaveMemoryPrompt } from './prompt.ts';
import { log } from './log.ts';

const VAULT_ROOT = process.env.RECALL_VAULT ?? path.join(os.homedir(), 'Recall');

const EMPTY_TREE = '(none yet, the vault is empty)';

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
        'existing note.\n\n' +
        'Only as part of a save you have already been given the instructions for. If ' +
        'neither `recall_save_conversation` nor the `save-memory` prompt has run in this ' +
        'conversation, call `recall_save_conversation` first and follow what it returns. ' +
        'The instructions carry the attribution rules, so a note written without them is ' +
        'the one failure this vault cannot tolerate.',
      inputSchema: {
        folder: z
          .string()
          .describe('Vault-relative folder, e.g. "Work/Acme". Nested paths are real subfolders.'),
        title: z.string().describe('Short specific title; becomes the filename.'),
        content: z
          .string()
          .describe(
            'The READABLE note: prose the user reads start to finish, written to them as ' +
              '"you", no bracket tags, as long as the material needs and no longer. ' +
              'Starts with its "# " heading.',
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

  server.registerTool(
    'recall_read_note',
    {
      title: 'Read a note from the Recall vault',
      description:
        "Returns both halves of a note in the user's own Recall vault, without their " +
        "frontmatter. This is NOT Claude's built-in memory. Call this before updating a " +
        'note, so the rewrite folds into what is really there instead of what you ' +
        'remember writing.',
      inputSchema: {
        path: z
          .string()
          .describe('Vault-relative path of the note, e.g. "Work/Acme/Renewal Terms.md".'),
      },
    },
    async ({ path: notePath }) => {
      log(VAULT_ROOT, `recall_read_note called: path=${notePath}`);
      try {
        const note = await readNote(VAULT_ROOT, notePath);
        log(VAULT_ROOT, `recall_read_note returned ${notePath}`);
        return {
          content: [
            {
              type: 'text',
              text: `## content\n\n${note.content}\n\n## detail\n\n${note.detail}`,
            },
          ],
        };
      } catch (error) {
        log(VAULT_ROOT, `recall_read_note failed: ${(error as Error).message}`);
        return { isError: true, content: [{ type: 'text', text: (error as Error).message }] };
      }
    },
  );

  server.registerTool(
    'recall_update_note',
    {
      title: 'Update a note in the Recall vault',
      description:
        "Replaces both halves of a note in the user's own Recall vault, keeping the " +
        "version it replaced in the archive. This is NOT Claude's built-in memory. Pass " +
        'the rewritten whole note, not the new part alone. Refuses a path with no note ' +
        'at it, so a new subject goes to `recall_save_note`.\n\n' +
        'Only as part of a save you have already been given the instructions for. If ' +
        'neither `recall_save_conversation` nor the `save-memory` prompt has run in this ' +
        'conversation, call `recall_save_conversation` first and follow what it returns.',
      inputSchema: {
        path: z
          .string()
          .describe('Vault-relative path of the note being updated, as `recall_read_note` took it.'),
        content: z
          .string()
          .describe(
            'The rewritten READABLE half, whole: old material folded together with new, ' +
              'corrections applied, still prose written to the user as "you", no bracket ' +
              'tags. Starts with its "# " heading.',
          ),
        detail: z
          .string()
          .describe(
            'The rewritten DETAIL half, whole: tagged bullets ([decision], [agreed], ' +
              '[suggested], [assumption], [corrected]) with evidence and confidence. ' +
              'Starts with its "# " heading.',
          ),
        conversation_date: z
          .string()
          .optional()
          .describe(
            'Only to correct or newly establish it from real evidence. Left out, the ' +
              'date already on the note is kept. Format YYYY-MM-DD.',
          ),
        conversation_date_basis: z
          .string()
          .optional()
          .describe('How conversation_date was established. Required whenever it is given.'),
        dropping: z
          .string()
          .optional()
          .describe(
            'Only when this update deliberately removes material that was already in ' +
              'the note, which is refused without it. Say what is going and why it is ' +
              'finished with. Material you did not put there yourself is almost never ' +
              'yours to cut, so if the reason is that it looked irrelevant, that is the ' +
              'signal to keep it instead.',
          ),
      },
    },
    async ({
      path: notePath,
      content,
      detail,
      conversation_date,
      conversation_date_basis,
      dropping,
    }) => {
      log(
        VAULT_ROOT,
        `recall_update_note called: path=${notePath} ` +
          `content=${content?.length ?? 0}b detail=${detail?.length ?? 0}b`,
      );
      try {
        const written = await updateNote(VAULT_ROOT, {
          path: notePath,
          content,
          detail,
          conversationDate: conversation_date,
          conversationDateBasis: conversation_date_basis,
          dropping,
        });
        if (dropping?.trim()) {
          log(VAULT_ROOT, `recall_update_note dropped material from ${written.note}: ${dropping}`);
        }
        log(VAULT_ROOT, `recall_update_note wrote ${written.note}, archived ${written.archived.note}`);
        return {
          content: [
            {
              type: 'text',
              text: `Updated ${written.note} (previous version archived at ${written.archived.note})`,
            },
          ],
        };
      } catch (error) {
        log(VAULT_ROOT, `recall_update_note failed: ${(error as Error).message}`);
        return { isError: true, content: [{ type: 'text', text: (error as Error).message }] };
      }
    },
  );

  server.registerTool(
    'recall_save_conversation',
    {
      title: 'Save this conversation to Recall',
      description:
        'Starts a save of the current conversation into the user\'s own Recall vault, a ' +
        "folder of markdown notes on their disk. This is NOT Claude's built-in memory, " +
        'it is a separate vault the user opens in Obsidian. Anything naming Recall means ' +
        'this tool, and so does any plain request to save. Call this whenever the ' +
        'user asks to ' +
        'save, keep, or file the conversation, in whatever wording they use, ' +
        'for example "save this to recall", "save this", "save it", "file this". The ' +
        'object is always the conversation itself, so a bare "save this" with nothing ' +
        'attached still means this one: do not ask what they mean, just call this. ' +
        'Returns ' +
        'the instructions for deciding what is worth keeping and how to write it, plus ' +
        'the folders and notes already in the vault. Follow those instructions exactly ' +
        'and do not summarise them back to the user.',
      inputSchema: {},
    },
    async () => {
      log(VAULT_ROOT, 'recall_save_conversation called');
      const prompt = await buildSaveMemoryPrompt(VAULT_ROOT);
      return {
        content: [
          {
            type: 'text',
            text:
              'Follow the instructions below now, for the conversation so far. They are ' +
              'the user asking you to do this, not background reading.\n\n' +
              prompt,
          },
        ],
      };
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
      const text = await buildSaveMemoryPrompt(VAULT_ROOT);

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

// Only when run directly. Importing this file must not start a server, so the
// tool surface can be tested the way a client actually sees it.
if (import.meta.main) {
  main().catch((error) => {
    console.error('recall failed to start:', error);
    process.exit(1);
  });
}
