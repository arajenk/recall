# Paste version (for Phase 1 testing)

Copy everything below the line into a real conversation to test the prompt before any
code exists. This is the same prompt as `extraction-prompt.md` with the placeholders
filled in by hand.

The folder list currently says "none yet", which is true, the vault is empty. As real
folders appear, paste the actual list in there so the model files into them instead of
inventing new ones.

---

**Before anything else: this has nothing to do with your own memory.** Don't use your
memory tool, don't write to your memory files, and ignore whatever folder structure it
uses. I keep a plain folder of markdown notes on my own computer, separate from you and
outside your reach. I'm asking you to write one of those notes as text in your reply , 
I'll file it myself. Write it out in full; don't ask whether I want you to first.

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

- `[decision]`: I stated it, chose it, or committed to it
- `[agreed]`: you proposed it and I explicitly accepted it
- `[suggested]`: you raised it and I never responded either way
- `[assumption]`: inferred from context, never confirmed by me
- `[corrected]`: was believed earlier in the conversation and later turned out wrong
- `[context]`: background worth keeping that is not a claim about who decided what
- `[claim]`: a fact you introduced yourself, which nobody has verified

**You must never record something you generated as something I said.** If you cannot
point to a specific message where I said or accepted a thing, it is `[suggested]` or
`[assumption]`, never `[decision]` or `[agreed]`. Enthusiasm is not agreement. Silence
is not agreement. Me moving on to the next topic is not agreement.

When you are unsure which tag applies, choose the weaker one.

**Outside facts are yours, not mine.** Statistics, studies, citations, dates, technical
claims: if it came out of your own knowledge rather than out of the conversation, it is
`[claim]`, and the readable half has to say where it came from too ("I mentioned a study,
which you haven't checked"). Never write one as a bare fact in either half.

This matters more than it looks. A number or a citation reads as authoritative months
later, long after anyone remembers a
chatbot volunteered it. If you are not certain of an author, year, or figure, say what the
finding was and admit you are unsure of the source rather than producing a precise-looking
citation that might be wrong. A half-remembered reference recorded confidently is worse
than no reference.

For `[corrected]`, keep both halves: what was believed, and what replaced it, on one
line. A future reader needs to know the wrong turn was already taken, so they don't take it
again.

## Dates

These notes get a saved date when they are filed. That is not the same as when the
conversation happened, and you must not conflate the two.

You cannot see message timestamps, and today's date tells you nothing about a conversation
that started weeks ago. So give a `conversation_date` **only** when you have real
evidence: I said when it was, or the conversation contains dated content. When you do, say
how you know in a `conversation_date_basis` beside it.

Otherwise leave it out. Unknown is a perfectly good answer; a guessed date is not, because
it makes an old conversation read as current later on.

## Where the note goes

The folders that currently exist in that notes folder on my computer, this is the
destination, not your memory's structure:

```
(none yet, the folder is empty)
```

If folders are listed, use one that already fits, with its exact path. Nested paths like
`Work/Acme` are real nested folders, not alternatives.

Create a new folder only when nothing listed genuinely fits. When you do, name it for a
**durable area of my life or work** that will hold many notes over time, not for the
subject of this one conversation. If the folder you're about to create would only ever
contain this single note, it's too specific: go one level broader. The early folders set
the shape of everything filed later, so bias toward broad and few.

**Top-level folders are areas, never projects.** A named project belongs *inside* the area
it serves: `Work/Acme`, not `Acme`. Projects start, get renamed, and get abandoned;
areas don't. A folder tree whose top level fills up with project names stops being
navigable after a dozen of them.

Two areas that are easy to confuse, and shouldn't be:

- `Work/`: things I do for money. Businesses, clients, revenue.
- `Projects/`: side projects, each in its own subfolder (`Projects/Recall`,
  `Projects/Sidecar`). A side project stays here even if it might become a business one
  day; move it only once it actually earns.

**If you're writing several notes, their folders must form a coherent tree.** Never create
sibling top-level folders that mean the same thing. `Business` and `Work` are one area
under two names, not two areas. Pick one name and nest the rest under it. Check the folders
you're about to create against each other before committing to them.

Say at the end which folders you created, so I can catch a bad guess while there are still
few enough to fix.

If this conversation clearly belongs to a project that appears above under a different
name than it had before, say so rather than filing a near-duplicate.

## One note, or several?

**Do this before writing anything.** List the distinct subjects this conversation covered.
For each one, name the folder it would be filed under, including folders that don't exist
yet. Then:

- Subjects that would land in **different folders** are **different notes**.
- Subjects that would land in the **same folder** are **one note**.

Apply this even though my folder is currently empty. The question is where each subject
*would* go, not which folders exist right now.

Two things reliably deserve their own note:

- A **separate ongoing project**. It builds up its own history across many conversations
  and must not be buried inside another subject's note.
- A **different area of my life**: work, content, health, relationships. A conversation
  that drifts from a business problem into what to film this weekend is two notes, always.

Default to one note when subjects genuinely belong together. But burying an unrelated
subject inside a note titled for something else is the worse mistake: it's filed where
I'll never look for it, which is the same as losing it. Each note is titled for its own
subject and stands on its own. Never write notes that only make sense read together.

## If this conversation was saved before

The notes already in that folder, one path per line, so you can tell a subject that
continues one of them from a genuinely new one:

```
none yet
```

Match what you write now against the notes above. A subject that already has a note
**updates that note**; only genuinely new subjects get new ones. Never file a near-
duplicate of a note that already exists. If a subject came up earlier in the conversation
and hasn't been touched since, leave its note exactly as it is.

When updating, produce the **updated whole note**, not an addition to it. Fold new
information in where it belongs. Apply corrections rather than stacking them. Drop points
that turned out to be dead ends, unless the dead end itself is worth remembering. The
visible note is always the clean current picture.

Without the server there is nothing to read the old note back for you, so paste in the
note you are updating alongside its path. Say for each note you print whether it is new or
an update.

## Every note is written twice

Each note has two halves covering the same ground for different readers. Write both from
the same understanding, never let them disagree.

### The readable half

The one I actually read. Prose, not a log, it should read start to finish like something
a thoughtful person wrote down after the conversation.

```markdown
# <short specific title>

<2 to 4 short paragraphs: what this was about, what got decided and why, what is
still open. Written to me as "you". No bracket tags anywhere.>
```

No tag syntax here, but the attribution discipline still holds, carried by the wording.
"You decided to walk" and "I suggested it, and you didn't take a position" say exactly what
the tags say, in a sentence a human wants to read. If you'd have marked something
`[assumption]`, say plainly that it was never confirmed.

**Write to me, not about me.** Address me as "you", or leave the subject implicit ("Left
the partnership over the equity split"). Don't repeat my name line after line, it reads
like a case file written by a stranger.

At most **400 words**. This is binding.

**It has to stand on its own.** Assume I have the note and nothing else: not the
conversation, not the detail file. Anything needed to make sense of it goes in, including
the concrete stuff. Real numbers, real names, the actual thing that was said. Specifics
are what make a note worth keeping six months later.

#### How it should sound

Write it the way I would write it in my own notebook. Plain, direct, a bit blunt. Not an
assistant reporting back, and not an essay.

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

### The detail half

The machine-facing counterpart. Precision matters here, readability doesn't. Be as
technical and complete as the conversation supports.

```markdown
# <same title>, detail

## Decisions
- [decision] ..., evidence: <what I actually said>

## Open / unresolved
- [suggested] ...
- [assumption] ..., confidence: low/medium/high

## Context worth keeping
- [context] ...

## Corrections
- [corrected] Believed X → actually Y
```

Drop any section that would be empty. Add evidence, confidence, and any metadata worth
keeping, this half exists so the readable one doesn't have to carry it, and so a future
tool can assemble a context pack from something rigorous.

One idea per bullet, one line per bullet. If a bullet needs a semicolon, a dash, or the
words "and also" to hold itself together, it is several bullets, or a sign the subject
deserves its own note. At most **12 bullets in any one section**.

Reading the note must be faster than rereading the conversation. That is the entire point
of it; a note that fails this test has no reason to exist.

## Output

For each note: print its target folder path on its own line, then both halves in fenced
markdown blocks, the readable one first, the detail one after. Nothing else, no
preamble, no offer to save it, no questions. Just the paths and the notes, as text in
this reply.
