# Working on Recall

Notes for anyone picking this up, including future me.

## Keep this file current

If a change touches the architecture, the commands, the file layout, the requirements, or
the project status, update this file in the same change. Not afterwards, and not in a
follow-up commit.

Delete instructions that have stopped being true instead of leaving them in place. A
future session will trust this file, so a stale line here is worse than a missing one. The
project status section below goes out of date fastest.

`AGENTS.md` is a pointer to this file and nothing more. Some tools look for that name and
will write their own copy if they do not find one, which is how a version claiming this
was a Codex server briefly ended up in the repo. Keep it a pointer.

## What this is

A local MCP server for Claude Desktop. You pick the `save-memory` prompt, and the model
that is already holding the conversation decides what is worth keeping and files it as
markdown in `~/Recall`. The summarizing happens in the conversation you are already in,
so there is no second model and no API cost.

`prompts/extraction-prompt.md` is the actual product. The server is plumbing. Most real
improvements are edits to that file, not to the code.

## Invariants

Break these and the project stops being worth using.

**Never record model output as something the user said.** If you cannot point at a message
where they said or accepted it, it is `[suggested]` or `[assumption]`, never `[decision]`
or `[agreed]`. Facts the model brings in from its own knowledge are `[claim]` and get
marked unverified. This is the whole reason the project exists.

**A note is a pair, written atomically.** The readable half goes at `Work/X/Note.md`, the
detail half at `_detail/Work/X/Note.md`. One call writes both or neither, they mirror each
other's paths, and each names the other in frontmatter. Do not add a code path that can
produce one alone, because a pair that can be written separately will drift apart. This
holds for updates and for the archive too: both halves are archived, both are replaced,
and a failure partway puts back what was there.

**An update never destroys the version it replaces.** `updateNote` archives both halves
before it writes either one. That archive is the only reason overwriting is allowed at
all, so a code path that updates without archiving takes the safety net away rather than
skipping a nicety.

**The server stamps dates, not the model.** `saved` and `updated` come from the server,
which is the only party that knows the time. On an update, `saved` is carried forward from
the note being replaced and only `updated` moves, so an old note that gets revised does
not start reading as though it were written today. `conversation_date` is recorded only with
real evidence and a stated basis. MCP exposes no conversation metadata and the model
cannot see message timestamps, so an unknown date stays unknown rather than quietly
becoming today.

**Every path goes through `resolveInVault`.** The model chooses these paths, so they are
untrusted input. Anything resolving outside the vault is refused, not clamped.

**One prompt, never forked.** ChatGPT support is planned. When it lands it reads the same
`extraction-prompt.md`. Two copies means two different note formats in one vault.

There are two ways to start a save, the `save-memory` prompt in the menu and the
`recall_save_conversation` tool, and both go through `buildSaveMemoryPrompt`. Neither
assembles its own. A save that reaches a write tool without those instructions writes a
note with no attribution rules applied, which is why both write tools tell the model to
go back and start properly.

`paste-version.md` is the one sanctioned hand-filled copy, and it drifted anyway: it spent
a whole phase missing the Dates section and several rules the canonical prompt had. Two
tests in `prompt.test.ts` now hold them together, one on the `##` headings and one on a
list of load-bearing phrases. It may differ in person ("the user" becomes "I") and in how
it asks for output, since it has no tools to call. It may not lose a rule. Add a rule to
the canonical prompt and you add it to both, or the suite fails, which is the point.

**No em dashes anywhere**, including tool descriptions in `server.ts`. Those get sent to
the model as context, so dashes there work against the instruction telling it not to use
them. Same for the prompt files.

## Layout

```
prompts/extraction-prompt.md   the product. Placeholders filled by the server
prompts/paste-version.md       same prompt by hand, for testing without the server
src/server.ts                  tools and the save-memory prompt
src/vault.ts                   folder and note listing, path safety
src/notes.ts                   writes, reads, updates and archives the pair
src/prompt.ts                  fills the template, owns the output contract
src/server.test.ts             the tool surface, over an in-memory transport
src/log.ts                     appends to <vault>/.recall/server.log
```

## Running it

```bash
npm test        # node's built-in runner, no build step
npm start       # stdio server, mostly useful for piping raw JSON-RPC at it
```

Needs Node 24 or newer, since the code imports `.ts` files directly and relies on native
type stripping with no build step. Only tested on 25.

Registered in `~/Library/Application Support/Claude/claude_desktop_config.json` with an
absolute node path, since Claude Desktop launches without your shell PATH. Restart the app
to pick up code changes.

## Where it is

Phase 3. A conversation that continues a subject already in the vault updates that note
instead of filing a near-duplicate. The `save-memory` prompt carries the full note
inventory, so the model decides create or update on its own with no extra step for the
user. `recall_read_note` returns both halves without their frontmatter, and
`recall_update_note` replaces both, keeping the superseded version under
`.recall/archive/<folder>/<title>/<timestamp>.md`.

`recall_save_note` stays create-only on purpose. A title collision is far more often two
different subjects than one continued subject, and failing there sends the model to the
update tool rather than quietly merging them.

Nothing prunes the archive yet, so it grows without limit. Notes are small and the vault
is one person's, so this is fine for a long while, but it is the next thing to bite.

## Gotchas

A tool call that seems to hang is usually an unpressed approval button, not a broken
server. Read-only calls go through while write calls never arrive. Check
`~/Recall/.recall/server.log`: if the call is not in there, it never reached the server.

Claude Desktop logs MCP connections but not individual tool calls, which is why the server
keeps its own log.

Say **"save this to recall"**. Tested against Claude Desktop, that fires every time.
"Save this" on its own made the model ask what to save, and "remember this" went to the
client's own built-in memory instead, which is a different store the user cannot open in
Obsidian.

The built-in memory is not worth fighting for an ambiguous phrase. It is a first-party
feature and it wins, and sending "remember this" there is defensible anyway. Tool
descriptions steer wording, they do not settle it, so naming Recall is what makes it
certain. Do not add instructions claiming otherwise: the description said to ask which
memory the user meant, and the model did not, because that is not a rule a description can
enforce.

Importing `server.ts` does not start a server, `main()` is behind `import.meta.main`. That
is what lets `server.test.ts` connect a real client over an in-memory transport and read
the tool surface as a client sees it. Undo the guard and the test run hangs instead of
failing, which is a slow thing to work out from scratch.

The repo is public. Keep examples generic (`Work/Acme`, `Projects/Sidecar`) rather than
using real project names.


## Explaining your work

After completing a meaningful implementation, briefly explain what you built in plain English. Focus on the mental model: what changed, how it works, and any important decisions or tradeoffs. Keep it concise, and do not give me a long walkthrough or dump implementation jargon unless I ask for more detail.