# Recall extraction prompt

> Canonical prompt. Every path uses this file: manual paste testing, the MCP
> `save-memory` prompt, and the clipboard fallback. Do not fork it per platform.

---

**Before anything else: this has nothing to do with your own built-in memory.** Don't use
your memory tool and ignore whatever structure it uses. This is the user's own folder of
markdown notes on their computer, reached only through the Recall tools described below.
The folder tree given here is that external destination, not your memory's structure.

Read back over this entire conversation and write a note capturing what is actually
worth remembering from it.

## What to keep

Keep decisions, conclusions, ideas worth revisiting, constraints discovered, reasons
behind choices, and context a future reader would need to pick this thread back up cold.

Leave out the back-and-forth of how we got there, restated context, pleasantries, code
that lives in the repo anyway, and anything already obvious from the files themselves.
If a point wouldn't change what someone does later, it is not memory. Cut it.

## Attribution: the rule that matters most

Every line carries a tag marking where it came from:

- `[decision]`: the user stated it, chose it, or committed to it
- `[agreed]`: you proposed it and the user explicitly accepted it
- `[suggested]`: you raised it and the user never responded either way
- `[assumption]`: inferred from context, never confirmed by the user
- `[corrected]`: was believed earlier in the conversation and later turned out wrong
- `[context]`: background worth keeping that is not a claim about who decided what
- `[claim]`: a fact you introduced yourself, which nobody has verified

**You must never record something you generated as something the user said.** If you
cannot point to a specific message where the user said or accepted a thing, it is
`[suggested]` or `[assumption]`, never `[decision]` or `[agreed]`. Enthusiasm is not
agreement. Silence is not agreement. The user moving on to the next topic is not
agreement.

When you are unsure which tag applies, choose the weaker one.
A bug is not a decision. Neither is anything that merely happened. Events, findings, fixes
and things that turned out to be true are `[context]`, however important they were.
`[decision]` is only for a choice the user made. A note whose Decisions section is mostly
a list of things that occurred has inflated the tag, and the inflation is the same failure
as the one above, one notch quieter.


**Outside facts are yours, not the user's.** Statistics, studies, citations, dates,
technical claims: if it came out of your own knowledge rather than out of the
conversation, it is `[claim]`, and the readable note has to say where it came from too
("I mentioned a study, which you haven't checked"). Never write one as a bare fact in
either half.

This matters more than it looks. A number or a citation reads as authoritative months
later, long after anyone remembers a chatbot volunteered it. If you are not certain of an
author, year, or figure, say what the finding was and admit you are unsure of the source
rather than producing a precise-looking citation that might be wrong. A half-remembered
reference recorded confidently is worse than no reference.

For `[corrected]`, keep both halves: what was believed, and what replaced it, on one
line. A future reader needs to know the wrong turn was already taken, so they don't
take it again.

## Dates

Recall stamps when it saved the note. That is not the same as when the conversation
happened, and you must not conflate them.

You cannot see message timestamps, and the current date tells you nothing about a
conversation that started weeks ago. So supply `conversation_date` **only** when you have
real evidence: the user said when it was, or the conversation contains dated content.
When you do, say how you know in `conversation_date_basis`.

Otherwise leave it out. Unknown is a perfectly good answer; a guessed date is not, because
it makes an old conversation read as current later on.

## Where the note goes

The folders that already exist in the user's notes folder:

```
{{FOLDER_TREE}}
```

If folders are listed, choose the one that already fits and use its exact path. Nested
paths like `Work/Acme` are real nested folders, not alternatives.

Create a new folder only when nothing listed genuinely fits. On an empty or nearly
empty vault, will be most of the time. Name it for a **durable area of the user's life or
work** that will accumulate many notes, not for the subject of this one conversation. If
the folder would only ever hold this single note, it is too specific: go one level
broader. The early folders set the shape of everything filed later, so bias toward broad
and few.

**Top-level folders are areas, never projects.** A named project belongs *inside* the area
it serves: `Work/Acme`, not `Acme`. Projects start, get renamed, and get abandoned;
areas don't. A vault whose top level fills up with project names stops being navigable
after a dozen of them.

Two areas that are easy to confuse, and shouldn't be:

- `Work/`: things done for money. Businesses, clients, revenue.
- `Projects/`: side projects, each in its own subfolder (`Projects/Recall`,
  `Projects/Sidecar`). A side project stays here even if it might become a business
  one day; move it only once it actually earns.

**When one save produces several notes, their folders must form a coherent tree.** Never
create sibling top-level folders that mean the same thing. `Business` and `Work` are one
area under two names, not two areas. Choose one name and nest the rest under it. Check the
folders you're about to create against each other, and against the existing tree, before
committing to them.

Say at the end which folders you created, so the user can catch a bad guess while the tree
is still small enough to fix.

If this conversation clearly belongs to a project that appears in the tree under a
different name than it had before, say so rather than filing a near-duplicate.

## One note, or several?

**Do this before writing anything.** List the distinct subjects this conversation
covered. For each one, name the folder it would be filed under, including folders that
don't exist yet. Then:

- Subjects that would land in **different folders** are **different notes**.
- Subjects that would land in the **same folder** are **one note**.

Apply this even when the vault is empty. The question is where each subject *would* go,
not which folders happen to exist right now.

Two things reliably deserve their own note:

- A **separate ongoing project**. It accumulates its own history across many
  conversations and must not be buried inside another subject's note.
- A **different area of life**: work, content, health, relationships. A conversation that
  drifts from a business problem into what to film this weekend is two notes, always.

Default to one note when subjects genuinely belong together. But burying an unrelated
subject inside a note titled for something else is the worse failure of the two: it is
filed where the user will never look for it, which is the same as losing it.

Each note is titled for its own subject and stands on its own. Never write notes that
only make sense read together.

## If this conversation was saved before

{{EXISTING_NOTES}}

Match what you write now against the notes above. A subject that already has a note
**updates that note**; only genuinely new subjects get new ones. Never file a near-
duplicate of a note that already exists. If a subject came up earlier in the conversation
and hasn't been touched since, leave its note exactly as it is.

When updating, produce the **updated whole note**, not an addition to it. Fold new
information in where it belongs, and apply corrections rather than stacking them.

**What you may remove depends on where it came from.** A note you are updating usually
holds material from conversations you were not part of. Treat that as evidence rather than
as a draft:

- Add to it freely.
- Correct it where this conversation establishes it was wrong, marking the correction
  rather than quietly deleting the version that was there.
- Do **not** cut it for being irrelevant, redundant, or not worth the space. You cannot
  see the conversation that put it there, so you are not the one who can judge that.

Material this conversation put there itself is different. You watched it happen, so you
may drop a dead end that went nowhere, unless the dead end is worth remembering.

The visible note is always the clean current picture. Superseded versions are archived,
but that is a safety net and not a filing system: the reader opens the note, never the
archive, so the note has to stay complete on its own.

## Every note is written twice

Each note has two halves, saved together in one call. They cover the same ground for
different readers, so write both from the same understanding, never let them disagree.

### The readable note, `content`

This is the one the user actually reads. Prose, not a log. It should read start to finish
like something a thoughtful person wrote down after the conversation.

```markdown
# <short specific title>

<2 to 4 short paragraphs: what this was about, what got decided and why, what is
still open. Written to the user as "you". No bracket tags anywhere.>
```

No tag syntax here, but the attribution discipline still holds, carried by the wording.
"You decided to walk" and "I suggested it and you didn't take a position" say exactly what
the tags say, in a sentence a human wants to read. If you'd have marked something
`[assumption]`, say plainly that it was never confirmed.


**It has to stand on its own.** Assume the reader has the note and nothing else: not the
conversation, not the detail file. Anything needed to make sense of it goes in, including
the concrete stuff. Real numbers, real names, the actual thing that was said. Specifics
are what make a note worth keeping six months later.

#### How it should sound

Write it the way the user would write it in their own notebook. Plain, direct, a bit
blunt. Not an assistant reporting back, and not an essay.

Hard rules:

1. **No em dashes or en dashes anywhere.** Use a period, a comma, a colon, or parentheses.
   This one is absolute. Check the finished text for the characters before you send it.
2. **Straight quotes only**, never curly ones.
3. **No bold sprinkled through the prose**, no emoji, no headers inside the note.

Do not use these. These are the giveaways that a machine wrote it:

- Padding words: delve, testament, underscore, showcase, vibrant, tapestry, landscape
  (when abstract), pivotal, crucial, foster, intricate, robust, seamless, enhance.
- Tacked-on `-ing` clauses that pretend to add insight: "...highlighting the importance
  of...", "...reflecting a broader shift...". Cut them. They say nothing.
- "Not just X, it's Y" constructions, and clipped negations bolted onto the end of a
  sentence like "no guessing" or "no wasted effort".
- Groups of three. Two reasons are usually the honest number; three is a rhythm the model
  reaches for, not a fact about the world.
- Dressed-up verbs where a plain one works. "Is" and "has" are good words. Not "serves
  as", "stands as", "represents".
- A warm closing line that summarizes and reassures. End on the last real piece of
  information and stop. No "the important thing is", no "that's not a failing on your
  part", no send-off.
- Announcing what you are about to do instead of doing it: "let's break this down".

Vary the sentence lengths. Some short. Some longer where the thought actually needs the
room. Even, mid-length cadence across every sentence is itself a tell.

Above all, record what happened. Do not counsel, encourage, or soften. If something went
badly, write that it went badly and move on.

### The detail note, `detail`

The machine-facing counterpart, filed out of the way. Precision matters here, readability
doesn't. Be as technical and complete as the conversation supports.

```markdown
# <same title>, detail

## Decisions
- [decision] ..., evidence: <what the user actually said>

## Open / unresolved
- [suggested] ...
- [assumption] ..., confidence: low/medium/high

## Context worth keeping
- ...

## Corrections
- [corrected] Believed X → actually Y
```

Drop any section that would be empty. Add evidence, confidence, and any metadata worth
keeping, this half exists so the readable note doesn't have to carry it, and so a future
tool can assemble a context pack from something rigorous.

**Write to the user, not about them.** These are their own notes. Address them as "you", or
leave the subject implicit ("Left the partnership over the equity split"). Never repeat
their name line after line, it reads like a case file written by a stranger.

**Length follows the material, not a number.** A conversation that settled three things
gets a short note. One that settled twenty gets a long one, and squeezing it down to look
tidy throws away the thing the note exists to keep. Never drop something worth keeping
because the note is getting long.

What is banned is padding, not length: restating a point in different words, narrating the
conversation instead of recording what came out of it, and sentences that summarise the
sentence before them.

One idea per bullet in the detail note, one line per bullet. If a bullet needs a
semicolon, a dash, or the words "and also" to hold itself together, it is several bullets,
or a sign the subject deserves its own note.

If one section runs very long, ask whether this was really one subject. Often it is two,
and two notes serve the reader better than one covering both. But that is a judgement
about subjects, never a way to hit a length.

Reading the note must be faster than rereading the conversation. That is the entire point
of it; a note that fails this test has no reason to exist. A note is too long when it
repeats itself or wanders, not when the conversation genuinely held that much.

**Before you file anything, reread both halves and take out every em dash and en dash.**
That rule is the one most often broken, and it gets broken at the end, in text that was
already written before you got here.

## Output

{{OUTPUT_INSTRUCTION}}
