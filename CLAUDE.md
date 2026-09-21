# Working on Recall

Notes for anyone picking this up, including future me.

## Keep this file current

If a change touches the architecture, the commands, the file layout, or the requirements,
update this file in the same change. Not afterwards, and not in a follow-up commit.

Delete instructions that have stopped being true instead of leaving them in place. A
future session will trust this file, so a stale line here is worse than a missing one.

Status, test logs, and the history behind non-obvious fixes live in `docs/status.md`
(gitignored, not part of the public repo, since it's dated and narrative in a way this
file is meant not to be). Update that file in the same change too, and check it for what
has actually been tested against a real conversation versus just built.

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

**A rewrite may not cut what another conversation put there.** An update sees the note
plus one conversation, never the conversations that filled it. So material already in a
note can be added to and corrected, but not dropped for seeming irrelevant, because the
model judging that has not read the thread that put it there. Only material the current
conversation established may be dropped as a dead end. The archive makes a bad rewrite
recoverable, not harmless: nobody reads the archive, so a note that loses something has
lost it in practice.

`RETENTION_FLOOR` in `notes.ts` backs this with a check rather than leaving it to the
prompt. An update that keeps under 70% of either half is refused unless it passes
`dropping` saying what is going and why, which gets logged. The server cannot tell which
conversation is calling, so it cannot simply refuse, since trimming a dead end you raised
yourself is legitimate. Requiring a stated reason is the same move as `conversation_date`
requiring a basis: the questionable thing stays possible but stops being silent.

It is a floor, not a guarantee. An update that adds a lot while cutting one specific thing
nets out above it and passes.

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

**One prompt, never forked in silence.** What must never differ across copies of the
prompt is the rules: the tag vocabulary, attribution discipline, folder/area conventions,
one-note-or-several logic, and both-halves note structure. A test in `prompt.test.ts` holds
`paste-version.md` to a list of load-bearing phrases from the canonical prompt. Add a rule
to the canonical prompt and forget the other copy, and the suite catches it; it does not
catch a rule stated differently on purpose, which is why the test checks phrases, not full
equality.

There are two ways to start a save, the `save-memory` prompt in the menu and the
`recall_save_conversation` tool, and both go through `buildSaveMemoryPrompt`. Neither
assembles its own. A save that reaches a write tool without those instructions writes a
note with no attribution rules applied, which is why both write tools tell the model to
go back and start properly.

`paste-version.md` is one sanctioned hand-filled copy. It is the actual manual path:
anywhere Recall's tools are not reachable, claude.ai or mobile instead of Claude Desktop,
or something written elsewhere and pasted in and saved by hand. It may differ in person
("the user" becomes "I") and in how it asks for output, since it has no tools to call. It
may not lose a rule: two tests in `prompt.test.ts` hold it to the canonical prompt, one on
the `##` headings and one on a list of load-bearing phrases. Its folder list is a snapshot
of `~/Recall` taken by hand, not live, so it goes stale the moment a new folder appears;
check it against the real vault (`listFolders` in `src/vault.ts`, or just `ls ~/Recall`)
before pasting if it has been a while.

**No em dashes anywhere**, including tool descriptions in `server.ts`. Those get sent to
the model as context, so dashes there work against the instruction telling it not to use
them. Same for the prompt files.

## Layout

```
prompts/extraction-prompt.md   the product. Placeholders filled by the server
prompts/paste-version.md       same prompt by hand, for when no server is reachable
src/server.ts                  tools and the save-memory prompt
src/vault.ts                   folder and note listing, path safety
src/notes.ts                   writes, reads, updates and archives the pair
src/search.ts                  the standing list and recall_search's shortlist
src/prompt.ts                  fills the template, owns the output contract
src/cli.ts                     bin.recall-vault, dispatches to server/setup/uninstall
src/setup.ts                   npx recall-vault setup: writes Claude Desktop's config
src/uninstall.ts               npx recall-vault uninstall: removes it again
src/server.test.ts             the tool surface, over an in-memory transport
src/notes.test.ts              the pair, updates, the archive, the retention floor
src/vault.test.ts              listing and path safety
src/search.test.ts             title listing, shortlist matching, the gist, the cap
src/prompt.test.ts             template filling, and holds paste-version in line
src/cli.test.ts                dispatch, and that importing it starts nothing
src/setup.test.ts              path detection, plausibility check, idempotent merge
src/uninstall.test.ts          removing only the recall-vault entry
src/log.ts                     appends to <vault>/.recall/server.log
docs/status.md                 project status and the history behind non-obvious fixes,
                                kept local only (gitignored, not part of the public repo)
docs/specs/                    designs for work that is not built yet, kept local only
                                (gitignored, not part of the public repo)
docs/superpowers/plans/        implementation plans, kept local only
                                (gitignored, not part of the public repo)
```

## Running it

```bash
npm test        # node's built-in runner, no build step
npm start       # stdio server, mostly useful for piping raw JSON-RPC at it
```

Needs Node 24 or newer, since the code imports `.ts` files directly and relies on native
type stripping with no build step. Only tested on 25.

Published to npm as `recall-vault`. `npx recall-vault setup` installs it globally, detects
Claude Desktop's config path for the current OS, and writes the `mcpServers.recall-vault`
entry itself, backing up the existing file first. Re-running it replaces that entry in
place rather than duplicating it. `npx recall-vault uninstall` reverses just that entry,
leaving other configured servers and the vault itself untouched. Only the macOS config
path (`~/Library/Application Support/Claude/claude_desktop_config.json`) has actually been
exercised against a real install; Windows and Linux paths are written from convention and
setup says so when it uses them. Design in
`docs/superpowers/plans/2026-09-14-npm-distribution.md` and its spec,
`docs/specs/2026-09-14-npm-distribution-design.md`.

Restart Claude Desktop after setup or uninstall to pick up the change.

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
