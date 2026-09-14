# Recall

Turns a useful AI conversation into a clean `.md` file in a local folder you control. Works with Claude Desktop.

## How it works

Say "save this to recall," or run the `save-memory` prompt from the menu. The model looks at the conversation and the notes you already have, decides what's worth keeping and whether it's new or continues something already filed, and writes it. Updates archive the old version instead of overwriting it. No API key needed: the summarizing happens in the conversation you're already in.

Recall is also readable, not just writable. `recall_search` does a keyword search over your vault; `recall_context` loads the matching notes and works out what to trust when they disagree (something you said or decided outranks something the AI once suggested, and unresolved questions stay unresolved instead of getting guessed at). This works much better if you add a line to Claude Desktop's custom instructions telling it to check Recall before answering questions about things you might have written down; without that nudge it won't reliably think to search on its own.

## Setup

Requires Node.js 24+, npm, and Claude Desktop.

```bash
npx recall-vault setup
```

Installs `recall-vault`, finds Claude Desktop's config, and adds Recall to it. Restart Claude Desktop afterward, then look for `save-memory` in the prompt picker under `recall-vault`. Notes go to `~/Recall` by default; set `RECALL_VAULT` before running setup to change that. Tested on macOS; Windows and Linux write a config from known convention but are unverified, so open an issue if it doesn't work.

To remove it:

```bash
npx recall-vault uninstall
```

This only touches Recall's own entry, leaving other MCP servers and your notes alone. Run `npm uninstall -g recall-vault` separately to remove the command itself.

To run from source instead, clone the repo, `npm install`, `npm start`, and point Claude Desktop's config at your checkout's `src/server.ts` by hand (it launches without your shell PATH, so the absolute path matters).

## Using it

Name Recall specifically: "save this to recall." Plain "save this" tends to get a clarifying question back, and "remember this" goes to Claude's own built-in memory instead, which is a different store you can't open in Obsidian.

One conversation can produce several notes if it covered unrelated subjects. Check where things land while your vault is still new. Recall can only save what the model can still see, so for long conversations, save along the way rather than waiting until the end.

## What a note looks like

Every save writes two linked files:

```text
~/Recall/Work/Acme/Contract Renewal.md
~/Recall/_detail/Work/Acme/Contract Renewal.md
```

The first is what you read: plain prose, no clutter. The `_detail` half is for future AI sessions, holding decisions, suggestions, corrections, assumptions, and evidence separately so something the AI once suggested never quietly turns into something you said. Both are written together, point to each other, and can't drift apart.

`saved` and `updated` are stamped by the server when it writes the file. `conversation_date` is only set when the conversation itself gives real evidence for it; otherwise it stays unknown rather than assuming an old conversation happened today.

## Current limitations

Claude Desktop is the only client so far. `recall_search` and `recall_context` work and have run in real conversations, but in ordinary use Claude tends to search and then read a note directly, skipping the reconciliation step, so that part is lightly exercised. Search can also miss a note on an odd phrasing and needs a retry rather than concluding nothing exists.

## Development

```bash
npm test
npm start
```

`prompts/extraction-prompt.md` is the actual prompt Recall uses. `prompts/paste-version.md` is a hand-fillable copy for testing the extraction without running the server.

## Why

Coding agents already have files to pick up where an old session left off. Your AI conversations should too, instead of just disappearing.
