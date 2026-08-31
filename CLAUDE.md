# Working on Recall

Notes for anyone picking this up, including future me.

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
produce one alone, because a pair that can be written separately will drift apart.

**The server stamps dates, not the model.** `saved` and `updated` come from the server,
which is the only party that knows the time. `conversation_date` is recorded only with
real evidence and a stated basis. MCP exposes no conversation metadata and the model
cannot see message timestamps, so an unknown date stays unknown rather than quietly
becoming today.

**Every path goes through `resolveInVault`.** The model chooses these paths, so they are
untrusted input. Anything resolving outside the vault is refused, not clamped.

**One prompt, never forked.** ChatGPT support is planned. When it lands it reads the same
`extraction-prompt.md`. Two copies means two different note formats in one vault.

**No em dashes anywhere**, including tool descriptions in `server.ts`. Those get sent to
the model as context, so dashes there work against the instruction telling it not to use
them. Same for the prompt files.

## Layout

```
prompts/extraction-prompt.md   the product. Placeholders filled by the server
prompts/paste-version.md       same prompt by hand, for testing without the server
src/server.ts                  tools and the save-memory prompt
src/vault.ts                   folder listing, path safety
src/notes.ts                   writes the pair, frontmatter, title sanitizing
src/prompt.ts                  fills the template, fails loudly on a missing value
src/log.ts                     appends to <vault>/.recall/server.log
```

## Running it

```bash
npm test        # node's built-in runner, no build step
npm start       # stdio server, mostly useful for piping raw JSON-RPC at it
```

Registered in `~/Library/Application Support/Claude/claude_desktop_config.json` with an
absolute node path, since Claude Desktop launches without your shell PATH. Restart the app
to pick up code changes.

## Where it is

Phase 2. Create-only: saving the same conversation twice fails rather than updating,
because overwriting without archiving would destroy a note.

Phase 3 is next. Archive pairs under `.recall/archive/`, update in place, add `find_note`.

## Gotchas

A tool call that seems to hang is usually an unpressed approval button, not a broken
server. Read-only calls go through while write calls never arrive. Check
`~/Recall/.recall/server.log`: if the call is not in there, it never reached the server.

Claude Desktop logs MCP connections but not individual tool calls, which is why the server
keeps its own log.

The repo is public. Keep examples generic (`Work/Acme`, `Projects/Sidecar`) rather than
using real project names.
