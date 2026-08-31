# Recall

One button turns a useful AI conversation into organized, persistent memory. Clean `.md`
files in a plain local folder you can open in Obsidian, VS Code, or anything else.

Status: **Phase 3 working.** Claude Desktop saves notes into `~/Recall`, and a
conversation that carries on a subject you've saved before updates that note instead of
filing a near-duplicate beside it. Every version it replaces is kept.

## How it works

A local MCP server exposes a `save-memory` prompt and four tools. You pick the prompt in
Claude Desktop; the model, already holding the whole conversation, decides what's worth
keeping and splits it by subject. The prompt hands it the list of notes you already have,
so it works out on its own which subjects are new and which continue something already
filed, then calls `recall_save_note` or `recall_update_note` once per note. There is
nothing extra for you to do either way. The summarizing happens inside the conversation
you're already in, so there's no second model, no API key, and no extra cost.

## Setup

Already registered in `~/Library/Application Support/Claude/claude_desktop_config.json`.
**Restart Claude Desktop**, then find `save-memory` in the prompt picker (the `+` menu in
the composer, under `recall`).

Vault defaults to `~/Recall`; override with the `RECALL_VAULT` env var.

## Using it

Have a real conversation, then run the `save-memory` prompt. The model will:

1. split the conversation by subject, different destination folder means a different note
2. match those subjects against the notes already in your vault
3. call `recall_read_note` on any note it's continuing, to see what's actually there
4. call `recall_save_note` for new subjects, `recall_update_note` for continued ones
5. tell you where each landed, which were updated, and which folders it created

Check the folders it creates, especially early. The vault starts empty, so the first
several saves define your taxonomy, and a bad guess is much cheaper to fix at ten notes
than at two hundred.

## What the notes look like

Every save writes **two linked files**:

```
~/Recall/Work/Acme/Contract Renewal.md          ← you read this: prose, no tags
~/Recall/_detail/Work/Acme/Contract Renewal.md  ← tags, evidence, confidence
```

The readable note is prose written to you, under 400 words, meant to be read start to
finish. The detail counterpart carries the machine-facing precision, `[decision]`,
`[agreed]`, `[suggested]`, `[assumption]`, `[corrected]`, plus evidence and confidence , 
so the readable half never has to look like a log.

They cannot drift apart: one tool call writes both or neither, they mirror each other's
paths, and each points at the other in frontmatter. There is no code path that produces
one alone.

An update rewrites the whole note rather than appending to it, so what you read is always
the current picture rather than a changelog. The version it replaced goes to
`~/Recall/.recall/archive/`, both halves, one timestamped file per version. Nothing is
overwritten without a copy being kept first, which is the only reason updating in place is
allowed at all. The archive lives in a dot-folder, so Obsidian and the model both ignore
it.

The rule the product lives on holds in both halves: the model must never record something
it generated as something you said. In the detail note that's the tag; in the readable
note it's the wording ("you decided" vs "I suggested it and you didn't take a position").

Folder conventions: `Work/` is things done for money, `Projects/` holds side projects one
subfolder each. Top-level folders are areas, never project names.

## Dates, and what Recall honestly knows

Each note carries `saved` / `updated`, stamped by the server. When a note is updated,
`saved` stays put and only `updated` moves, so a note you revised last week doesn't start
claiming it was written last week. It is the only party here that
actually knows the time. These say when Recall wrote the note, **not** when the
conversation happened.

Those are different facts, and Recall usually can't know the second one. MCP exposes no
conversation metadata to a server: no transcript, no message timestamps, no start date.
The model can't see message timestamps either, so on an old thread reopened today it also
thinks it's today.

So `conversation_date` is written only when there's real evidence, you said when it was,
or the conversation contains dated content, and always alongside a
`conversation_date_basis` recording how it was established. A date offered without a basis
is refused. Absent means unknown, and never silently becomes today.

That matters for the future context pack: an old conversation imported today must not read
as fresh just because Recall saved it today.

## Development

```bash
npm test        # node's built-in runner, no build step
npm start       # run the server directly over stdio
```

`prompts/extraction-prompt.md` is the canonical prompt and the actual product, every path
reads it, and it must never fork per platform. `prompts/paste-version.md` is the same
prompt with placeholders filled by hand, for testing in a chat without the server.

## A limit worth knowing

The model can only summarize what it can still see. If the app has already dropped the
earliest part of a long conversation, no prompt recovers it. Save periodically rather than
once at the end.
