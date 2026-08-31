# Recall

One button turns a useful AI conversation into organized, persistent memory. Clean `.md` files in a plain local folder you can open in Obsidian, VS Code, or anything else.

Recall currently works with Claude Desktop and can save new memories. Updating existing memories is still being built.

## How it works

Recall runs as a local MCP server. When you feel like a conversation has something worth keeping, you run the `save-memory` prompt.

The model uses the conversation context it can currently see to decide what's worth keeping, splits it by subject if needed, and saves the notes through Recall.

The summarizing happens inside the conversation you're already in, so Recall doesn't need its own model or API key.

## Setup

### Requirements

- Node.js 24+
- Claude Desktop
- macOS (currently the only platform I've tested)

Clone the repo and install dependencies:

```bash
git clone <repo-url>
cd recall
npm install
```

Run the server:

```bash
npm start
```

Then add Recall to your Claude Desktop MCP config and restart Claude Desktop.

Once it's connected, `save-memory` should show up in the prompt picker under `recall`.

By default, notes are saved to `~/Recall`. You can change this with the `RECALL_VAULT` environment variable.

## Using it

Have a normal conversation, then run `save-memory` whenever there's something you want to keep.

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

Recall is still early. Right now it only works with Claude Desktop and can create new memories, but it can't update existing ones yet.

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
