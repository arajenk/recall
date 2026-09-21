#!/usr/bin/env node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { listFolders } from './vault.ts';
import { saveNote, readNote, updateNote, loadContext } from './notes.ts';
import { listNoteTitles, searchNotes } from './search.ts';
import { buildSaveMemoryPrompt } from './prompt.ts';
import { log } from './log.ts';

const VAULT_ROOT = process.env.RECALL_VAULT ?? path.join(os.homedir(), 'Recall');

const EMPTY_TREE = '(none yet, the vault is empty)';

/**
 * Names the notes already in the vault, so `recall_search`'s description
 * stops the model from never thinking of the vault at all. This is level one
 * of retrieval: always present, paid for once at startup rather than on every
 * turn.
 */
function standingList(titles: string[]): string {
  if (!titles.length) return 'The vault has no notes yet.';

  return (
    'Notes already in the vault, so you know what might already exist before ' +
    `searching:\n${titles.map((title) => `- ${title}`).join('\n')}`
  );
}

export async function createServer(vaultRoot: string = VAULT_ROOT): Promise<McpServer> {
  const server = new McpServer({ name: 'recall', version: '0.1.0' });
  const titles = await listNoteTitles(vaultRoot);

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
      log(vaultRoot, 'recall_list_vault called');
      const folders = await listFolders(vaultRoot);
      log(vaultRoot, `recall_list_vault returned ${folders.length} folder(s)`);
      return {
        content: [{ type: 'text', text: folders.length ? folders.join('\n') : EMPTY_TREE }],
      };
    },
  );

  server.registerTool(
    'recall_search',
    {
      title: 'Search the Recall vault',
      description:
        "Searches the readable text of notes already in the user's own Recall vault. " +
        "This is NOT Claude's built-in memory. Returns a short shortlist, path plus " +
        'dates plus a one line gist, never a whole note. If you are answering a ' +
        'question, or more than one result looks relevant, call `recall_context` on ' +
        'the paths that matter next, so the notes get reconciled rather than read at ' +
        'face value. Call `recall_read_note` instead only when you already know you ' +
        'need one specific note in full, such as right before updating it. If ' +
        'nothing comes back, try at least one different phrasing before concluding ' +
        'the vault has nothing on the subject: this is a plain match on the words ' +
        'actually in a note, not a meaning search.\n\n' +
        standingList(titles),
      inputSchema: {
        query: z.string().describe('Plain text terms to look for. All terms must match.'),
      },
    },
    async ({ query }) => {
      log(vaultRoot, `recall_search called: query=${query}`);
      const matches = await searchNotes(vaultRoot, query);
      log(vaultRoot, `recall_search returned ${matches.length} match(es)`);
      if (!matches.length) {
        return { content: [{ type: 'text', text: 'No matching notes in the vault.' }] };
      }
      return {
        content: [
          {
            type: 'text',
            text: matches
              .map((match) => `- ${match.path} (saved ${match.saved}, updated ${match.updated}): ${match.gist}`)
              .join('\n'),
          },
        ],
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
              '[agreed], [suggested], [assumption], [corrected], [superseded]) with ' +
              'evidence and confidence. Precision over readability. Starts with its ' +
              '"# " heading.',
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
        vaultRoot,
        `recall_save_note called: folder=${folder} title=${title} ` +
          `content=${content?.length ?? 0}b detail=${detail?.length ?? 0}b`,
      );
      try {
        const written = await saveNote(vaultRoot, {
          folder,
          title,
          content,
          detail,
          conversationDate: conversation_date,
          conversationDateBasis: conversation_date_basis,
        });
        log(vaultRoot, `recall_save_note wrote ${written.note}`);
        return {
          content: [{ type: 'text', text: `Saved to ${written.note} (detail: ${written.detail})` }],
        };
      } catch (error) {
        log(vaultRoot, `recall_save_note failed: ${(error as Error).message}`);
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
        'remember writing. For answering a question from the vault rather than editing ' +
        'it, prefer `recall_context` instead, which also applies the attribution and ' +
        'conflict-resolution rules; reach for this one only when you already know you ' +
        'need a single specific note in full.',
      inputSchema: {
        path: z
          .string()
          .describe('Vault-relative path of the note, e.g. "Work/Acme/Renewal Terms.md".'),
      },
    },
    async ({ path: notePath }) => {
      log(vaultRoot, `recall_read_note called: path=${notePath}`);
      try {
        const note = await readNote(vaultRoot, notePath);
        log(vaultRoot, `recall_read_note returned ${notePath}`);
        return {
          content: [
            {
              type: 'text',
              text:
                'Readable half. If you rewrite it, pass back only this text as `content`, ' +
                `never including the line below or anything after it:\n\n${note.content}`,
            },
            {
              type: 'text',
              text:
                'Detail half, a separate file from the readable half above. If you rewrite ' +
                `it, pass back only this text as \`detail\`, never merged into \`content\`:` +
                `\n\n${note.detail}`,
            },
          ],
        };
      } catch (error) {
        log(vaultRoot, `recall_read_note failed: ${(error as Error).message}`);
        return { isError: true, content: [{ type: 'text', text: (error as Error).message }] };
      }
    },
  );

  server.registerTool(
    'recall_context',
    {
      title: 'Load background from the Recall vault',
      description:
        "Loads the detail half of specific notes from the user's own Recall vault, framed " +
        "as background for the current conversation. This is NOT Claude's built-in memory. " +
        'Call `recall_search` first to find which notes matter, then pass their paths here ' +
        'rather than guessing a path directly.\n\n' +
        'Each note comes back with its saved and updated dates and its detail half, which ' +
        'carries attribution tags: [decision] is something the user decided, [agreed] ' +
        'something they agreed to, [suggested] your own suggestion, [assumption] something ' +
        'assumed rather than confirmed, [claim] a fact you brought in from your own ' +
        'knowledge rather than from the user. [corrected] and [superseded] each read as ' +
        '"X, then Y" on one line: [corrected] when X was believed and turned out wrong, ' +
        '[superseded] when X was decided or agreed to and a later conversation ' +
        'deliberately replaced it, not an error, a change of course. Either way X is ' +
        'history, never a live candidate, no matter its own kind or how recent it is; ' +
        'only Y counts, ranked at whatever tag it actually carries now. When notes ' +
        'disagree, resolve it in this order: what the user says right now outranks ' +
        'everything here; failing that, a decision outranks an agreement, which outranks ' +
        'a suggestion, which outranks an assumption, which outranks a claim; between two ' +
        'of the same kind, the more recent one holds. Newer never simply beats older on ' +
        'its own — a decision from months ago ' +
        'still outranks a suggestion from yesterday. If you cannot tell which position the ' +
        'user still holds, say so plainly rather than picking one.',
      inputSchema: {
        paths: z
          .array(z.string())
          .describe('Vault-relative note paths, as returned by recall_search.'),
      },
    },
    async ({ paths }) => {
      log(vaultRoot, `recall_context called: paths=${paths.join(', ')}`);
      const entries = await loadContext(vaultRoot, paths);
      const ok = entries.filter((entry) => entry.ok).length;
      log(vaultRoot, `recall_context loaded ${ok}/${entries.length} note(s)`);

      const text = entries
        .map((entry) =>
          entry.ok
            ? `### ${entry.path} (saved ${entry.saved}, updated ${entry.updated})\n\n${entry.detail}`
            : `### ${entry.path}\n\n${entry.error}`,
        )
        .join('\n\n');

      return { content: [{ type: 'text', text }] };
    },
  );

  const textEdit = z.object({
    old_str: z
      .string()
      .min(1, 'old_str cannot be empty, there is nothing there to anchor a replacement to.')
      .describe(
        'Exact text to find, copied from what `recall_read_note` returned for this ' +
          'half, whitespace included. Must match exactly once; a close paraphrase is ' +
          'refused rather than guessed at.',
      ),
    new_str: z.string().describe('Text to put in its place.'),
  });

  server.registerTool(
    'recall_update_note',
    {
      title: 'Update a note in the Recall vault',
      description:
        "Changes one or both halves of a note in the user's own Recall vault, keeping " +
        "the version it replaced in the archive. This is NOT Claude's built-in memory. " +
        'Refuses a path with no note at it, so a new subject goes to `recall_save_note`.\n\n' +
        'Prefer `content_edits` / `detail_edits` over resending a whole half: give the ' +
        'exact text to change, copied from what `recall_read_note` returned, and its ' +
        'replacement, and the server applies it. Use this for adding one item, ' +
        'correcting one sentence, or removing one thing. Each `old_str` must match the ' +
        "note's current text exactly and only once; retyping a half from memory instead " +
        'of matching it exactly is where updates used to go wrong. Leaving both ' +
        '`content`/`content_edits` out leaves the readable half exactly as it is; same ' +
        'for `detail`/`detail_edits`. At least one of the four is required.\n\n' +
        'Pass `content` or `detail` as whole text only for a real restructuring, not a ' +
        'small change. That is still the rewritten whole half, old material folded ' +
        'together with new, not the new part alone, and it is rejected immediately if ' +
        'it is much shorter than what the note already held, so do not send a short ' +
        'draft to see whether it is accepted, that only buys a failed call and a retry.\n\n' +
        'Only as part of a save you have already been given the instructions for. If ' +
        'neither `recall_save_conversation` nor the `save-memory` prompt has run in this ' +
        'conversation, call `recall_save_conversation` first and follow what it returns.',
      inputSchema: {
        path: z
          .string()
          .describe('Vault-relative path of the note being updated, as `recall_read_note` took it.'),
        content: z
          .string()
          .optional()
          .describe(
            'Whole rewritten READABLE half, old material folded together with new, ' +
              'corrections applied, still prose written to the user as "you", no bracket ' +
              'tags, starting with its "# " heading. Only for a real restructuring; for a ' +
              'small change use content_edits instead. Omit to leave this half unchanged.',
          ),
        content_edits: z
          .array(textEdit)
          .optional()
          .describe('Targeted changes to the readable half. See content_edits/detail_edits above.'),
        detail: z
          .string()
          .optional()
          .describe(
            'Whole rewritten DETAIL half, tagged bullets ([decision], [agreed], ' +
              '[suggested], [assumption], [corrected], [superseded]) with evidence and ' +
              'confidence, starting with its "# " heading. Only for a real ' +
              'restructuring; for a small change use detail_edits instead. Omit to ' +
              'leave this half unchanged.',
          ),
        detail_edits: z
          .array(textEdit)
          .optional()
          .describe('Targeted changes to the detail half. See content_edits/detail_edits above.'),
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
      content_edits,
      detail,
      detail_edits,
      conversation_date,
      conversation_date_basis,
      dropping,
    }) => {
      const describe = (whole: string | undefined, edits: { old_str: string; new_str: string }[] | undefined) =>
        edits ? `${edits.length} edit(s)` : whole !== undefined ? `${whole.length}b whole` : 'unchanged';
      log(
        vaultRoot,
        `recall_update_note called: path=${notePath} ` +
          `content=${describe(content, content_edits)} detail=${describe(detail, detail_edits)}`,
      );
      try {
        const written = await updateNote(vaultRoot, {
          path: notePath,
          content,
          contentEdits: content_edits?.map((edit) => ({ oldStr: edit.old_str, newStr: edit.new_str })),
          detail,
          detailEdits: detail_edits?.map((edit) => ({ oldStr: edit.old_str, newStr: edit.new_str })),
          conversationDate: conversation_date,
          conversationDateBasis: conversation_date_basis,
          dropping,
        });
        if (dropping?.trim()) {
          log(vaultRoot, `recall_update_note dropped material from ${written.note}: ${dropping}`);
        }
        log(vaultRoot, `recall_update_note wrote ${written.note}, archived ${written.archived.note}`);
        return {
          content: [
            {
              type: 'text',
              text: `Updated ${written.note} (previous version archived at ${written.archived.note})`,
            },
          ],
        };
      } catch (error) {
        log(vaultRoot, `recall_update_note failed: ${(error as Error).message}`);
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
      log(vaultRoot, 'recall_save_conversation called');
      const prompt = await buildSaveMemoryPrompt(vaultRoot);
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
      const text = await buildSaveMemoryPrompt(vaultRoot);

      return { messages: [{ role: 'user', content: { type: 'text', text } }] };
    },
  );

  return server;
}

export async function main(): Promise<void> {
  await fs.mkdir(VAULT_ROOT, { recursive: true });
  log(VAULT_ROOT, `server starting (pid ${process.pid}, vault ${VAULT_ROOT})`);
  const server = await createServer();
  await server.connect(new StdioServerTransport());
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
