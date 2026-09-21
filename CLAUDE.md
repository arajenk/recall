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

`paste-version.md` is one sanctioned hand-filled copy, and it drifted anyway: it spent
a whole phase missing the Dates section and several rules the canonical prompt had. Two
tests in `prompt.test.ts` now hold them together, one on the `##` headings and one on a
list of load-bearing phrases. It may differ in person ("the user" becomes "I") and in how
it asks for output, since it has no tools to call. It may not lose a rule. Add a rule to
the canonical prompt and you add it to both, or the suite fails, which is the point.

Started as a Phase 1 testing artifact, before the server existed to fill placeholders at
all. Now it is the actual manual path: anywhere Recall's tools are not reachable, claude.ai
or mobile instead of Claude Desktop, or something written elsewhere and pasted in and saved
by hand. Its folder list is a snapshot of `~/Recall` taken by hand, not live, so it goes
stale the moment a new folder appears; check it against the real vault (`listFolders` in
`src/vault.ts`, or just `ls ~/Recall`) before pasting if it has been a while.

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

## Where it is

Phase 3. A conversation that continues a subject already in the vault updates that note
instead of filing a near-duplicate. The `save-memory` prompt carries the full note
inventory, so the model decides create or update on its own with no extra step for the
user. `recall_read_note` returns both halves without their frontmatter. `recall_update_note`
can replace a whole half with `content`/`detail`, or patch it with `content_edits`/
`detail_edits`, an `old_str`/`new_str` pair per change matched exactly and only once, the
same contract the `Edit` tool itself uses. Either way it keeps the superseded version under
`.recall/archive/<folder>/<title>/<timestamp>.md`.

`recall_save_note` stays create-only on purpose. A title collision is far more often two
different subjects than one continued subject, and failing there sends the model to the
update tool rather than quietly merging them.

A save starts either by asking in the chat, which calls `recall_save_conversation`, or
from `save-memory` in the menu. Both build through `buildSaveMemoryPrompt`.

**The update path has now run against the real vault.** A scripted client, connected the
same way `server.test.ts` connects one, called `recall_save_note` then `recall_update_note`
on the same path in `~/Recall` (a throwaway note, deleted afterward). It confirmed the
whole chain for real: the pair gets rewritten, the pre-update pair lands in
`.recall/archive/...`, `saved` carries forward while only `updated` moves, the retention
floor actually refuses a gutting update with no `dropping`, and `recall_update_note` now
has entries in `~/Recall/.recall/server.log`. What this has not done is run inside an
actual Claude Desktop conversation, where the model itself decides create vs. update from
the note inventory rather than being told which tool to call. That is the remaining gap
before trusting this fully.

Phase 4 is designed and its first stage is now built, not yet validated:
`docs/specs/2026-09-03-bidirectional-recall-design.md` covers notes being read back into a
conversation. Saving stays manual: an earlier draft had retrieval responses carry a save
nudge, and it was cut because a server cannot save anything anyway, so the nudge only ever
bought a reminder at a moment the model picked rather than one you did.

Stage 1 of that design is in code: `recall_search` in `src/server.ts`, backed by
`src/search.ts`. `createServer` now builds a standing list from the vault's own note
titles at construction time and embeds it in `recall_search`'s description, so the model
knows what already exists before it ever calls the tool. `recall_search` itself does a
plain AND-match over note paths and bodies, capped at five results, returning only a
path, its saved and updated dates, and a one line gist built from the note's own heading
and opening line, never the note itself. `createServer` is now `async` and takes an
optional `vaultRoot`, both so the standing list can read real vault contents at startup
and so tests can point it at an isolated temp vault instead of the real one.

**This has now run inside an actual Claude Desktop conversation, and the tool description
alone is not enough, but a client-side nudge on top of it is.** The whole design rested on
one assumption, that the model will call a retrieval tool on its own with no prompting,
once a tool description tells it the vault has something relevant. Tested on 2026-09-13
against the real vault, several natural conversations asked directly about subjects the
standing list named, including one where the model had no other source for the answer and
said plainly it did not know. `recall_search` was never called on the strength of the tool
description by itself.

Along the way, `~/Library/Application Support/Claude/claude_desktop_config.json` was found
pointing at a path that had never existed (`Dev Projects` instead of `Dev`), so the first
several attempts were testing nothing at all. That got fixed, and the negative result
above is from after the fix, with the server confirmed running.

Adding one line to Claude Desktop's own custom instructions (Settings, Profile, an account
setting, not a file in this repo), telling the model to check Recall before answering
questions about past projects or decisions, changed the result. In a fresh chat asked
about the same kind of subject, `recall_search` fired unprompted, including a self
correction: it guessed a note path directly first, that failed, then it fell back to
`recall_search`, got a shortlist, and read the right note. Log entries
2026-09-13T01:07:54 through 01:08:02 in `~/Recall/.recall/server.log`.

So Stage 1's mechanism works, but only paired with an instruction this repo cannot ship or
version, since it lives in the user's account settings rather than in code. One success is
not yet a pattern proven, so Stage 2 (`recall_context`) proceeds provisionally rather than
on full confidence, and it is worth watching a few more natural conversations to confirm
this was not a fluke before leaning on it.

**Stage 2 is now in code and has run once against a real conversation, successfully.**
`recall_context` lives in `src/server.ts`, backed by `loadContext` in `src/notes.ts`. It
takes note paths (as `recall_search` returns them) and loads each note's detail half plus
its saved/updated dates — never the readable half, since the readable half has its
attribution brackets stripped and reconciling conflicting notes is the whole point of this
tool. A bad path or a note missing its detail half is reported inline per path rather than
failing the whole call, since the model may ask for several notes at once and one miss
should not lose the rest. The conflict-resolution rules from the design doc (current
statement outranks everything, then decision > agreement > suggestion > assumption > claim,
then more recent within the same kind, unknown stays unknown rather than guessing) live in
the tool's own description, the same standing-instruction channel `recall_search`'s note
list uses, because the model does the reconciling and needs the rule at the moment it reads
the notes. All of this is covered by `notes.test.ts` and `server.test.ts`.

Tested on 2026-09-13, in the same vault, on a note (`Personal/Finance/Emergency Fund
Target.md`) carrying a `[suggested]` item the user never took a position on. Asked
directly whether they had decided between two options, the model correctly
reported that as still open — it named the suggestion as a suggestion, not a decision,
and did not guess a side the user never picked. Same self-correction pattern as Stage 1:
it first called `recall_context` with a
path missing `.md` (loaded 0/1), then fell back to `recall_search` for the real path
before retrying `recall_context` successfully. One real success on the "unknown stays
unknown" rule; the decision-precedence ordering (decision beats agreement beats
suggestion, etc.) has not yet been exercised by an actual conflict between two notes, so
that part is still unvalidated.

**A day of ordinary use on 2026-09-13 surfaced two gaps in the custom-instructions nudge
itself, from reading `~/Recall/.recall/server.log`, not from a scripted test.** First,
`recall_context` has never actually fired in real usage. The model's habit is
`recall_search` then `recall_read_note` on the readable half directly, skipping the tool
built specifically to load the detail half and apply the conflict-resolution ordering.
That means the precedence rules described two paragraphs up are still unexercised in
practice, not just unexercised by an engineered conflict. Second, `recall_search` returned
zero matches for both `gym membership renewal` and `weekly meal prep schedule` moments
before a new note got created on exactly that subject with
`recall_save_note` rather than updating something related, echoing the same
create-vs-update judgment gap noted in Phase 3 above; a single failed phrasing was treated
as "nothing exists" rather than prompting a retry.

The custom instruction line quoted above only told the model to check Recall before
answering, not which tool to prefer once it has a match or what to do on a miss. It now
reads:

> Before answering a question about an ongoing project, past decision, or something I
> might have written down, check the Recall vault with `recall_search` first. If it
> returns matches, use `recall_context` to load and reconcile them rather than
> `recall_read_note` alone. If it returns zero matches, try at least one different
> phrasing before concluding nothing exists.

This is still an account setting, not a file in this repo, so nothing here enforces it;
the next thing to confirm is whether `recall_context` starts actually appearing in the
server log, and whether a second search phrasing catches what the first one missed.

A ChatGPT/Notion bridge (ChatGPT writing into a Notion inbox, a local importer draining
that into `saveNote`/`updateNote`) was designed and partly built, then shelved on
2026-09-13: too much setup friction (a custom GPT, two Notion databases, an Actions schema,
a manual import step) for what it bought. The code, prompts, and design doc were removed
rather than left half-built and rotting. Not ruled out forever, just off the table until a
lower-friction way to get ChatGPT into this vault turns up.

Nothing prunes the archive yet, so it grows without limit. Notes are small and the vault
is one person's, so this is fine for a long while, but it is the next thing to bite.

Known and not worth fixing yet: "remember this" reaches the client's own memory rather
than Recall, and the retention floor is a floor, so an update that adds a lot while
cutting one specific thing passes it.

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

**`recall_update_note` used to fail its first attempt more often than not, and the first
fix for that did not work.** `~/Recall/.recall/server.log` from 2026-09-15 showed the
model calling it with a `detail` of a few dozen bytes against a note whose detail half ran
to thousands, tripping the retention floor, then retrying with the real content seconds
later. The first fix, also 2026-09-16, added a line to the extraction prompt and the tool
description saying not to send a short draft, and put the current and attempted lengths in
the refusal message. It made things worse: the next real save took five attempts and six
minutes on one note. Wording could not fix this, because the actual problem was the model
being asked to retype a 10-15KB detail half from memory across a tool call boundary, and
it kept choosing a short draft over a faithful but effortful full reproduction.

Fixed for real the same day by changing what the tool asks for instead of asking harder for
the same thing. `recall_update_note` now takes `content_edits`/`detail_edits`, an array of
`{old_str, new_str}` pairs applied to the half's current text, the same contract the `Edit`
tool itself uses. `old_str` must match what `recall_read_note` returned exactly and exactly
once, or the call is refused naming what did not match, rather than guessing. An update
that adds one bullet or fixes one sentence no longer requires regenerating everything around
it, which is what was actually failing. Whole-text `content`/`detail` is still there for a
real restructuring, and the retention floor still checks whatever the edits produce, so the
invariant above is unchanged. `resolveHalf`/`applyEdits` in `notes.ts` do the work; covered
by `notes.test.ts` and two end-to-end cases in `server.test.ts`. Not yet confirmed against a
real conversation, only against the test suite; the log is the thing to check next.

**A decision that changes later had no way to say so, and now does: `[superseded]`.**
Before this, a decision recorded in one conversation and reversed in a later one had two
bad outcomes. Either the update left both `[decision]` lines sitting in the note with no
signal which one still held, which `recall_context`'s ranking (decision > agreement >
suggestion > assumption > claim, then recency within a kind) cannot resolve on its own
since both lines share a kind and the note only carries one `updated` date for the whole
thing, not one per line. Or the model quietly dropped the old line to avoid that, which is
exactly the destructive rewrite the retention floor exists to catch. `[superseded]` gives a
third option, the same shape as the existing `[corrected]` tag (kept both halves, one line,
"X, then Y"), but for a choice that changed rather than a belief that was wrong: `[decision]
Chose Rust for the backend` becomes `[superseded] Chose Rust for the backend → switched to
Python once build times became a blocker`, and the new position gets its own line with
whatever tag it actually carries now. `recall_context`'s description now says plainly that
the position before the arrow in a `[corrected]` or `[superseded]` line is history, never a
live candidate regardless of its kind or recency; only the position after the arrow enters
the ranking. This is a prompt and tool-description change only, the same as how
`[corrected]` already worked with no code enforcement: `notes.ts` does not parse tags, it
still just stores and returns whatever text the model writes. Touches
`prompts/extraction-prompt.md`, `prompts/paste-version.md`, and the three tag lists in
`src/server.ts` (`recall_save_note`, `recall_update_note`, `recall_context`); covered by
`prompt.test.ts`'s phrase-parity check and a `server.test.ts` assertion on the
`recall_context` description. Not yet exercised against a real reversed decision in an
actual conversation, only against the test suite.

**Three small fixes, 2026-09-20, aimed at making context actually easier to pull rather
than at anything broken.** None of them touch the reconciliation rules themselves.

`searchNotes` in `search.ts` required every query term to appear as an exact substring, so
"assignments" missed a note that only said "assignment," and "coding" missed one that only
said "code." It now falls back to a crude stem comparison (longest common English suffixes
stripped, plus a silent-e variant so "cod" from "coding" also tries "code") only when the
literal match fails, so a query that already worked keeps working exactly as before; this
only widens what counts as a match. Covered by two new cases in `search.test.ts`.

`recall_search`'s own description told the model to call `recall_read_note` on a result
next, which worked against the model actually being steered toward `recall_context` for
reconciliation, since nothing else in the tool surface pointed the other way once search
had already said what to do next. `recall_search` now says to call `recall_context` when
answering a question or when more than one result looks relevant, and reserves
`recall_read_note` for when a single specific note is already known, e.g. right before
updating it. `recall_read_note`'s description now says the same thing from its side.
Covered by a new `server.test.ts` assertion on both descriptions; not yet observed whether
this actually changes which tool gets called in a real conversation.

`pairPaths` in `notes.ts`, the one function every model-supplied note path passes through,
now appends `.md` when a path is missing it, since the model has been seen dropping the
extension when echoing a path back from a `recall_search` result. Additive only: a path
that already ends in `.md` is untouched. Covered by one new case each in `notes.test.ts`
for `readNote` and `loadContext`.

## Explaining your work

After completing a meaningful implementation, briefly explain what you built in plain English. Focus on the mental model: what changed, how it works, and any important decisions or tradeoffs. Keep it concise, and do not give me a long walkthrough or dump implementation jargon unless I ask for more detail.