# Recall in both directions

Today Recall only works when you ask it to. You say "save this to recall" and a note gets
written. Nothing else ever happens.

This design covers the other direction: notes coming back into a conversation when they
are useful. It also covers what the system does when it does not know something, which
turned out to be the part most worth getting right.

Saving stays manual, and there is a section below on why an earlier draft's attempt to
make it semi automatic was cut.

Nothing here is built. The staging section at the end says what gets built first and what
it has to prove before the rest is worth doing.

## The constraint everything bends around

Claude Desktop gives an MCP server no way to act first. There is no per turn hook, and
neither of the two protocol features that would let a server start something (sampling and
elicitation) is supported in the desktop app. Resources are not loaded automatically
either; they are attachments the user clicks to add.

So the server can never speak first. It can only answer when the model calls a tool.

That means "automatic" cannot mean the server doing anything on its own. It can only mean
the model choosing to call a tool at the right time. Everything below is an attempt to
make that choice likely, using the two channels that actually exist: the tool description,
which is present in every conversation, and the tool response, which arrives in the
model's hands at a moment we control.

This project already learned that the first channel is weak. A tool description told the
model to ask which memory the user meant, and it did not, because that is not a rule a
description can enforce. The second channel is much stronger and is already used: the save
instructions come back inside a tool response prefixed with "they are the user asking you
to do this, not background reading," and that works.

## Three levels, so nothing loads just in case

The requirement is to give the model what it needs without pushing the whole vault at it
constantly. That is met by never handing over one big thing. There are three levels, and
each one is only paid for when the level before it earned it.

**Level one: the standing list. Always present, nearly free.**

The server reads the vault when it starts and builds the search tool's description from
what is actually there, naming the subjects rather than describing the tool in the
abstract. This sits in every conversation whether it is needed or not.

Its only job is to stop the model from never thinking of the vault at all. Without it the
model has no way to know there are notes about Lucent, so it never looks, and every other
level is unreachable. This is the cheapest change in the design and the one the rest
depends on.

Costs: the list rides along in conversations where it is useless, note titles are visible
in every chat, and it only refreshes when the app restarts. Whether Claude Desktop honours
a mid session tool list update is untested.

**Level two: the shortlist. Only when the model asks.**

The model says what it is looking for in plain words. It gets back a capped list of
matching notes, each one a path, its dates, and a single line of gist. Not the notes.

Most of the time this is enough to know whether going further is worth it. This is the
level that satisfies the "do not overload it" requirement, because the model gets a menu
rather than the meal.

**Level three: the notes themselves. Only the ones it picked.**

The model asks for specific notes by path and gets their contents.

## What comes back at level three, and why only half

Every note is a pair. The readable half is prose for the user with the attribution
brackets deliberately stripped out. The detail half keeps them: which parts you decided,
which you agreed to, which the model suggested, assumed, or brought in from its own
knowledge.

**Only the detail half is ever fed back to a model.**

Two reasons, and the second is the stronger one.

The safety reason: hand back clean prose and the model cannot tell its own three week old
guess from something you said. The guess returns looking like your words, gets built on,
and eventually gets saved again as fact. That is the exact failure this project exists to
prevent, and reading notes back is the first feature capable of causing it.

The functional reason: the conflict rules below are built on the brackets. Without them
there is nothing to reason with, and the system falls back to comparing dates, which is
the rule that is wrong.

`recall_read_note` keeps returning both halves, because the update flow rewrites both and
needs to see both. Feeding context back is a different job and gets its own tool.

## Conflicts

When two notes disagree, they are resolved in this order.

**First, by who said it.** Something you decided outranks something you agreed to, which
outranks something the model suggested, which outranks something it assumed, which
outranks a fact it brought in from its own knowledge. A decision of yours from a month ago
beats the model thinking out loud yesterday.

**Then, only between two things of the same kind, by date.** Two of your own decisions
that disagree, the later one holds, and it says so rather than quietly picking.

**Above all of it, what you say now.** You are in the room and the notes are not.

Recency is deliberately not the first rule. "Newer wins" hands the win to the model's
freshest speculation over your older decision, which is the failure mode this whole project
was built around.

## Asking you

Two kinds of question, with different manners.

**About which position you hold.** When two things you said disagree and it matters to
what is being discussed right now, you get asked directly, with enough of both to
recognise them: here are two things you have said, which do you still stand behind.

Not which came first. Which one you hold. That is both the answerable question and the
useful one. Recognising a position you took is something people are good at. Recalling
when they took it is not.

This is asked plainly, not buried. A soft aside gets skimmed past and the wrong thing goes
on being recorded as true. It is only asked when the conflict touches the current
conversation. Two old notes disagreeing about something nobody has mentioned in weeks are
left alone, because a system that adjudicates every inconsistency it can find gets ignored,
and an ignored system is worse than a quiet one.

**About dates.** Occasionally, lightly, and easy to wave off. Never as a yes or no
question about a specific day, because a specific day invites a shrug of agreement and
produces a confident wrong record with your name on it. Asked open, with context to grab
onto: "was this the conversation about the delivery spending, and roughly when was that?"

The date field must accept a vague answer and store it vaguely. A month or a season, kept
as a month or a season. Turning "sometime in spring" into a specific day invents precision
you never gave.

## Unknown stays unknown

**If you cannot say, and the brackets cannot say, the note records that it is unresolved.**
It does not pick one.

The note keeps both positions, says the timing is unclear, and says it is unsettled. You
are never made to choose to make the record tidy.

This looks like a failure and is not. An unresolved thing recorded as unresolved is
honest, and stays visible until something actually resolves it. An unresolved thing that
got silently decided reads exactly like a real decision six months later, and nothing
about it will ever look wrong.

## When you do answer, it gets written down

An answer you give is used in the conversation and then written down. On the next save it
goes into the note as something you settled, with the date you settled it.

The conflict then stops recurring, and the vault gets more correct every time it confuses
you. That property does not exist today.

**Answering does not erase the position you moved away from.** The note records that you
held one thing then and hold another now. The change is information. Overwriting leaves a
note claiming you always thought this, and the fact that you moved is gone. The archive
technically keeps the old version, but nobody reads the archive, so gone from the note is
gone in practice.

## Saving stays manual

An earlier draft of this design had the retrieval response carry a save nudge: when the
model asked for a note that was older than the conversation holding it, the response would
tell it to offer an update at a pause. That is cut, and the reasoning is worth keeping
because it applies to anything else that tries to make saving happen on its own.

The nudge could never save anything. The client does not let a server act, so the most it
could ever do is remind you to say a sentence you can already say yourself. The whole
feature buys a reminder and pays for it with an interruption.

The interruption is also badly timed by construction. You say "save this to recall" when
something has concluded, which is when a note is worth writing. A nudge fires whenever the
model happens to be reading an old note, which may be early in a conversation that has not
produced anything yet. Both routes go through `buildSaveMemoryPrompt`, so the prompt and
the model are identical either way. Only the timing differs, and the manual timing is
better. A nudge would produce worse notes more often, not more notes.

What is given up is the forgetting case. A good conversation that ends with the tab
closing leaves nothing behind, and no part of this design catches that. That is accepted
rather than solved.

One narrower trigger may deserve a second look later, and only later. Not "you might want
to save this," but the specific case where the model has read a note and the conversation
has directly contradicted it. That is a statement of fact about a note being wrong rather
than a guess about your intentions, and it is the only version that does not depend on the
model judging when you are finished. It is not part of any stage below.

## What this does not solve

A conversation about something genuinely new has nothing in the vault, so nothing matches,
so retrieval never runs. That is precisely the conversation most worth saving.

There is no fix for this inside the desktop app. The standing list helps slightly, since
the model at least knows the vault exists. Slightly is the honest word. New subjects will
mostly still be you saying "save this to recall."

Truly hands off saving would need something outside the client reading the conversation
store and a second model to summarise it, which breaks both the no API cost premise and
the "the model already in the conversation does the work" premise the design rests on. It
is out of scope, not merely unbuilt.

## Invariants this must not break

- Nothing the model produced is ever recorded as something you said. Feeding notes back is
  the first feature that can cause this, and the detail half rule is the guard.
- The note stays the unit. Notes are not decomposed into fragments, and combined summaries
  are never written to disk. A combination is built fresh in the conversation and
  evaporates. Stored, it would be a document with no honest attribution sitting among
  attributed notes, and it would decay each time it was summarised again.
- A note is a pair, written atomically. Unchanged by any of this.
- The server stamps dates. Staleness arithmetic stays server side for that reason.
- Every path goes through `resolveInVault`. Search results and context loads included.
- One extraction prompt, never forked.
- No em dashes.

## Tool surface

Two new tools. Both read only, which matters, because read only calls go through without
an approval press and write calls do not.

**`recall_search`** takes what the model is looking for in plain words and returns a
shortlist capped at five: path, saved and updated dates, and a line of gist. Five is a
starting number, not a considered one, and should move once there is real usage to look
at. At stage one the gist is taken from the note's own heading and opening line, so no new
storage is required.
Matching is plain text over titles, folder names and note bodies, which is more than
adequate for a vault this size.

**`recall_context`** takes note paths and returns their detail halves with dates, framed as
background: this was true on this date, these brackets say who said what, what the user
says now outranks all of it.

The risk with the second one is that it looks a lot like `recall_read_note` and the model
picks the wrong one. Their descriptions have to draw that line hard: one is for rewriting a
note, the other is for informing an answer.

## Failure behaviour

- No matches: say so plainly. Never soften it into a guess.
- A note with a missing detail half: report it. The pair invariant says this cannot happen,
  so if it does, the honest move is to surface it rather than quietly return half a note.
- A path outside the vault: refused, as everywhere else.
- The standing list on a large vault: at eight notes this is free. It does not stay free.
  Where the cap goes, and whether the list becomes folders only past some size, is not
  settled here.

## Staging, and the assumption that decides everything

The riskiest assumption in this document is that the model will call a retrieval tool on
its own once it knows the vault has something relevant. If that is false, the entire
context half is unreachable in Claude Desktop and most of this design is unbuildable.

So it gets tested first, cheaply, before anything is built on top of it.

**Before anything: the update test.** Not code. Two conversations about one subject, saved
in turn, confirming that updating and the archive behave in the real vault. Updating is the
remedy for a stale note, so this design leans on a path that has never run. This has been
outstanding for a while and is an hour of work.

**Stage one: `recall_search` and the standing list.** The smallest thing that answers the
question. No conflict rules and no context loading. The measurement is already
built: the server logs every call, so the log shows whether searches happen without being
asked for. If they do not, stop here and the rest of this document is paper rather than
code to delete.

**Stage two: `recall_context`, the conflict rules, unknown staying unknown, and the two
kinds of question.** The substance, built only once stage one shows the model bites.

**Stage three, only if earned: a derived index at `.recall/index.json`** holding subjects per
note so selection stops depending on literal text matching. The trigger is selection being
what fails, not the vault growing: searches returning the wrong notes, or missing one
because you said "food delivery" and the note says "DoorDash". At the current size this
would be ceremony. The index must stay derived and rebuildable from the notes, so deleting
it loses nothing. Adding it changes only how `recall_search` picks; the tool looks
identical from outside, so stage one does not need to anticipate it.

## Still open

**Whether you see the combined view.** When the model pulls three notes and reconciles
them, it can either show you what it worked out before answering, or use the notes quietly
and just answer. Showing it means you catch a bad reconciliation immediately, at the cost
of a wall of text in front of every answer. Quiet is smoother and trusts the reconciliation
you never saw. Not decided.

Two smaller ones are noted where they arise: the shape of the standing list once the vault
outgrows a handful of notes, and how to keep `recall_context` and `recall_read_note` from
being confused for each other.

## Testing

Unit tests in the existing style for search matching, capping, path safety, gist
extraction, the detail half rule, and the conflict ordering.

The conflict ordering deserves real cases rather than a happy path: a decision against a
newer suggestion, two decisions of yours against each other, and one that resolves to
unknown and must stay unknown. That last one is the test that will catch a future change
quietly deciding to be helpful.

None of it substitutes for the real check, which is behavioural and only observable in
Claude Desktop: does the model search on its own, and does it ask you the right question at
the right moment. The server log is the instrument.
