# Recall

One button turns a useful AI conversation into organized, persistent memory. Clean `.md` files in a plain local folder you can open in Obsidian, VS Code, or anything else.

Recall currently works with Claude Desktop. It can create new notes, update ones you already have, and pull old notes back into a conversation when they're relevant.

## How it works

Recall runs as a local MCP server. When you feel like a conversation has something worth keeping, you say "save this to recall" in the chat, or run the `save-memory` prompt from the menu. Both do the same thing.

The model uses the conversation context it can currently see to decide what's worth keeping, splits it by subject if needed, and saves the notes through Recall.

It also gets a list of the notes you already have, so it works out on its own whether a subject is new or continues something already filed. If it updates a note, the version it replaced is kept under `.recall/archive` rather than thrown away.

The summarizing happens inside the conversation you're already in, so Recall doesn't need its own model or API key.

## Reading notes back

Recall isn't just one-way. Claude can search your vault mid-conversation and use what it finds to answer questions about past projects or decisions, instead of relying only on what's in the current chat.

`recall_search` does a plain keyword search over your notes and returns a short list of matches. `recall_context` loads the fuller detail behind those matches and works out what to trust when notes disagree. Something you actually said or decided outranks something the AI once suggested. If nothing settles it, it says so instead of guessing.

This works better if you add a line to your Claude Desktop custom instructions telling it to check Recall before answering questions about things you might have written down. Without that nudge, Claude won't reliably think to search on its own, even though the tools are right there.

## Setup

### Requirements

- Node.js 24+
- Claude Desktop
- npm

Run:

```bash
npx recall-vault setup
```

This installs `recall-vault` globally, finds Claude Desktop's config file, and adds Recall
to it. If it can't find or read that file, it prints the config block for you to paste in
by hand instead of guessing wrong. Restart Claude Desktop afterward.

Once it's connected, `save-memory` should show up in the prompt picker under `recall-vault`.

By default, notes are saved to `~/Recall`. You can change this with the `RECALL_VAULT`
environment variable before running setup.

This has been tested on macOS. Setup also writes a config on Windows and Linux from known
convention, but that path is untested; if it doesn't work, please open an issue.

### Removing it

```bash
npx recall-vault uninstall
```

This removes Recall from Claude Desktop's config, leaving every other MCP server you have
configured untouched and leaving your notes exactly where they are. To also remove the
`recall-vault` command itself, run `npm uninstall -g recall-vault` separately.

### Running from source

If you're contributing or want to run against a local checkout instead of the published
package:

```bash
git clone <repo-url>
cd recall
npm install
npm start
```

Then add the server to Claude Desktop's config by hand, pointing `command` at your local
Node binary and `args` at the absolute path to `src/server.ts` in your checkout, since
Claude Desktop launches without your shell PATH.

## Using it

Have a normal conversation, then say "save this to recall" whenever there's something you want to keep. Name Recall specifically. "Save this" on its own tends to get a question back about what you mean, and "remember this" goes to Claude's own built-in memory, which is a different store you can't open in Obsidian.

Recall will look at your existing folders, figure out what from the conversation is actually worth saving, and organize it into the vault.

One conversation can create multiple notes. If you talked about completely different things, Recall can split them instead of shoving everything into one file.

Especially when your vault is new, check where things end up. The first few saves will start defining how your folders are organized.

## What the notes look like

Every save writes two linked files:

```text
~/Recall/Work/Acme/Contract Renewal.md
~/Recall/_detail/Work/Acme/Contract Renewal.md
```

The first is the one you actually read. It's clean prose without a bunch of tags or metadata getting in the way.

The `_detail` version is for future AI sessions. It keeps things like decisions, suggestions, corrections, assumptions, evidence, and confidence.

The important rule is that Recall should never turn something the AI suggested into something you supposedly said or believed. The detail note keeps that distinction explicit, while the readable note just writes it naturally.

Both files are written together and point to each other, so they can't drift apart.

## Dates

Recall knows when it saved a note. It doesn't necessarily know when the original conversation happened.

`saved` and `updated` are stamped by the server.

`conversation_date` is only added when there's actual evidence for it, like a date mentioned in the conversation. Otherwise it stays unknown instead of guessing that the conversation happened today.

This matters when saving older conversations because an old conversation imported today shouldn't suddenly look new.

## Current limitations

Recall is still early, and Claude Desktop is the only client so far.

Search and context have run in real conversations and behaved correctly, including recognizing when a question has no settled answer. But in ordinary use Claude tends to search and then read a note directly, skipping `recall_context`, so the part that resolves conflicting notes hasn't really been exercised. Search can also miss a note on the first phrasing and needs a retry rather than concluding nothing exists.

It can also only save what the model can still see. If the beginning of a really long conversation has already fallen out of context, Recall can't magically recover it. For long conversations, save periodically instead of waiting until the very end.

## Development

```bash
npm test
npm start
```

`prompts/extraction-prompt.md` is the actual prompt Recall uses.

`prompts/paste-version.md` is a version you can paste into a conversation manually to test the extraction without running the server.

## Why I built it

Coding agents already have files they can use to pick up where an old session left off.

I wanted the same thing for normal AI conversations.

Your AI conversation can disappear. The useful context shouldn't.
