# todo
- Seitenansicht mit korrektem Page break
- Pause anch jedem Vers oder nach dem Block
- Korrektur beim Lesen AI gestützt 

# Hifz Master

A Qur'an memorization companion. Pick a range of verses by dragging across them, then drill
that block on a loop — with per-verse repeats, a pause sized to what you just heard,
adjustable playback speed, and a record of what you already know.

Runs entirely in the browser. No account, no backend, no API key. The text and the fonts ship
with the app — only the recitation comes off the network.

---

## Features

**Select verses by dragging.** Press and drag across the verse cards with a mouse; on touch,
hold a verse for a moment and then drag — a normal swipe still scrolls the page. `Shift`+click
extends the range from the current verse, `Escape` clears it. Dragging past the top or bottom
edge scrolls the list along, so a range can reach beyond one screen.

**Loop the block.** The selection plays through and starts over, indefinitely. With nothing
selected, the current verse is the block — so the controls always do something.

**Repeat each verse.** 1–10× before moving on. Repeats run back to back; the pause sits only
at the end of a full pass.

All four dials — speed, repeats and the two pauses — live behind the slider button next to the
play controls. It opens a small panel above the bar, so the verses stay readable while you
adjust something mid-recitation.

**Two pauses, both proportional to the material.** Instead of a fixed number of seconds, each
silence is a multiple (0–3×) of what you just listened to — measured while it plays, so it
accounts for the playback speed:

- **After each verse**, sized by that verse. This is the gap you recite into, and it follows
  every recitation — between the repeats of one verse just as much as between two verses.
- **After the block**, sized by a full pass through it, before it starts over. A one-verse
  block gets a pause the length of that verse; a five-verse block gets five times as much.

Both default to 0×, which is the old back-to-back behaviour. Because reciters differ in tempo,
both factors are **saved per reciter**.

**Playback speed.** 0.5× to 2×. Pitch is preserved, so slowing down does not distort the maqam.

**English translation (optional).** Off by default. Switch it on in the settings panel and pick
one of five editions — Talal Itani's *Clear Qur'an*, Saheeh International, Pickthall, Yusuf Ali,
or Muhammad Asad. The translation appears under each verse. All five ship with the app; the one
you pick is read from disk once and then kept in memory.

**Pick the Arabic typeface.** Four faces for the verses, chosen in the settings panel and shown
there as a specimen rather than by name — Scheherazade New (the default), Amiri Quran, Amiri and
Noto Naskh Arabic. Each carries its own size and line height, so switching does not change how
densely the block sits: at the same pixel size Arabic faces differ far more than Latin ones do,
and Noto in particular sets a short alef over a wide run.

The font of the printed Madinah Mushaf (KFGQPC) is deliberately not among them. It expects the
KFGQPC text edition, in which a silent alef carries `U+0652`; the Tanzil text bundled here writes
it as `U+06DF`, which that font cannot attach — it draws a placeholder circle instead, at 3,988
places in the Qur'an. Neither version 0.18 nor 2022's V22 differs in this. Offering it means
shipping its text edition alongside it; see `todo.md`. The four that are offered were each
checked against all 69 codepoints the bundled text uses.

**Read the printed page.** A second view sets the Madinah Mushaf line for line as it is printed —
604 pages, the ornamental band and basmala at each surah, the verse numbers in their rosettes, the
rubʿ al-hizb marks. Switch to it with the book button in the header. Selecting a range works
exactly as in the list: drag across the words, and the highlight follows the text around the line
breaks. Playback, repeats and pauses are unchanged; the page turns by itself when the recitation
leaves it.

The edition is the **1441 H print**, the one the Complex sells in Madinah today. That matters more
than a date: it breaks its lines differently from the 1421 H print on 355 of the 604 pages, so on
more than half the Mushaf a page set from the older edition does not match what is in your hands.
Which verses a page holds is the same in both, on every page.

This view is built on the QCF V4 fonts — one glyph per word, 47 files covering the 604 pages —
which is the only way to reproduce the printed line breaks. They ship with the app but are not
loaded at startup: a face arrives when a page asks for it, and covers the next six to fifteen
pages. One consequence worth knowing is that this view shows no progress marks. Mark verses in
the list view.

**Track what you have learned.** Mark a single verse with the check button on its card, or an
entire surah from the sidebar. Each surah row shows `learned/total` and a hairline progress bar;
the sidebar header shows the overall count.

**Review what you know, and earn what comes next.** The check-book button in the header opens a
third view: a rotation of everything you have taken up, what is due today, and whether you have
earned a new piece.

A *unit* is either a Mushaf page or a whole surah — the same thing to everything below, an ayah
range with a schedule. Pages suit a steady front; a surah suits something you learned as a whole.
Take a page up from the Mushaf view where you are standing, or a surah from its row in the
sidebar.

Drilling one covers the printed page and uncovers it an ayah at a time. You recite into the gap —
the ayah you owe stays highlighted as an empty band in its own shape — and press space when you
want to see whether you had it. The line breaks stay exactly where they are printed, because the
text is only made transparent, never removed. A surah spanning several pages turns them itself as
you go. At the end you rate the whole unit once: **Halting**, **Solid** or **Fluent**, each shown
with the interval it buys.

Scheduling is [FSRS](https://github.com/open-spaced-repetition/ts-fsrs), capped at 30 days —
something not recited for a month is not memorized, whatever the model says. Due dates are days,
not moments: a unit planned for today is due at breakfast, not at the hour you happened to rate it.

**New material is earned, not chosen.** The gate opens only when nothing is due *and* each of the
last three units was last rated Solid or better over at least three ratings. Since a unit can only
be rated while it is actually due, those three ratings are three different days — a unit cannot
vouch for itself on the day you learned it. Typically that puts about a week between new pages.
That is the point: the usual reason hifz collapses is a review debt growing faster than the time
to service it.

When the gate is shut it says which unit is holding it and offers to drill that one. **Practice**
mode is always available on anything, from anywhere, and writes nothing at all — that is the
release valve for when a page is too big a bite this week.

Taking a unit up marks its verses learned. Removing one from the rotation does *not* unmark them:
a decision about scheduling should not erase a record of what you know.

Everything — selection, settings and progress — is kept in the browser's `localStorage`.

---

## Running it

**Prerequisites:** Node.js

```bash
npm install
npm run dev
```

The dev server listens on port `3100` and binds `0.0.0.0`, so the app is also reachable from
another device on the same network (useful for testing the touch gestures on a phone). Both are
set in `vite.config.ts`.

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server with hot reload |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the built output |
| `npm run fetch:quran` | Re-download the text into `public/data/` (rarely needed — see below) |
| `npm run fetch:mushaf` | Re-download the Mushaf page layout (605 requests, about a minute) |
| `npm run fetch:fonts` | Re-download the fonts into `public/fonts/` (113 requests, ~38 MB) |
| `npm run check:review` | Check the review scheduler — the gate, the day boundary, the stored form |
| `npx tsc --noEmit` | Type check (not part of the build — Vite transpiles without checking) |

There is no test framework. `check:review` is one script in the style of the two fetch scripts:
it imports `services/review.ts` straight into Node — which strips the types itself — asserts its
way through the cases that fail silently rather than loudly, and exits non-zero. That is also why
that module touches neither the browser nor the other two services: both read `import.meta.env`
as they load, and would throw outside Vite.

---

## How it is put together

React 19 + TypeScript, bundled by Vite. Tailwind v4 is compiled into the bundle by
`@tailwindcss/vite`, so utility classes are written inline and what ships is one minified
stylesheet rather than a compiler. There is no `tailwind.config.js`: v4 is configured in CSS,
and the two lines this app needs — which files to scan, and dark mode following a class rather
than the media query — are at the top of `index.css`.
The Arabic type is the one exception to writing styles inline: family, size and leading per face
sit in `index.css`, because a Tailwind size utility and that rule carry equal specificity. They
are deliberately outside any `@layer`, which is what settles it — unlayered CSS outranks every
layer, so the Arabic rule wins whatever order the compiled utilities come out in.
Icons are `lucide-react`. State is plain `useState`; there is no state management library.

| File | Role |
|---|---|
| `index.html` | The pre-paint theme and font script, and the link to the mirrored Google Fonts stylesheet |
| `index.css` | Tailwind's entry point, and every Arabic font definition — family, size and leading per face |
| `App.tsx` | Everything stateful: playback engine, settings, sidebar, practice bar |
| `components/AyahRow.tsx` | One verse card. Memoized — a drag updates the range every pointer frame, and Al-Baqara has 286 rows |
| `components/MushafPage.tsx` | One printed page: its lines, the surah bands, and the type size measured to fit the measure |
| `services/mushaf.ts` | Loads the page layout on first use, and the QCF4 faces a page needs from `public/fonts/` |
| `services/review.ts` | The whole scheduler: the stored shape, FSRS, due dates, the gate. No browser, no other service — so it can be checked under Node |
| `hooks/useReview.ts` | That state in React, persisted, recomputed when the day turns |
| `hooks/useMushafLayout.ts` | The lazy layout load, for whichever view needs pages |
| `components/ReviewDashboard.tsx` | The rotation: what is due, what is earned, what is in it |
| `components/ReviewSession.tsx` | The drill. Its entire state is one number — how many ayahs are uncovered |
| `scripts/check-review.mjs` | Checks the scheduler. Run by hand, not by the build |
| `scripts/fetch-mushaf.mjs` | Downloads and checks that layout. Run by hand, not by the build |
| `scripts/fetch-fonts.mjs` | Downloads and checks the fonts, both sets. Run by hand, not by the build |
| `hooks/useVerseRangeSelection.ts` | The drag gesture: pointer events, touch long-press, edge auto-scroll, hit testing |
| `services/quranApi.ts` | Reads the bundled text into memory and hands out surahs; builds the audio URL |
| `scripts/fetch-quran.mjs` | Downloads and checks that text. Run by hand, not by the build |
| `types.ts` | `Surah`, `Ayah`, `SurahDetail`, `AyahRange` |

### The playback engine

One state machine drives everything. `activeRange` is the drag selection, or the current verse
when there is none, and `handleAudioEnd` walks it: after every recitation wait
`verse × verseFactor`, repeat the verse `n` times, advance, and at the end of the block measure
the pass and wait `pass × factor` before starting over. Both waits go through `schedule`, which
runs its callback immediately at a factor of 0 — that is what keeps 0× exactly as seamless as
it was before.

Two things in there are load-bearing and easy to break:

- **Playback intent lives in a ref, not in state.** The media element fires `pause` immediately
  before `ended`, which would wipe a state flag before the effect that advances to the next
  verse could read it.
- **`playbackRate` is re-applied after every source change.** The media load algorithm resets
  it to `defaultPlaybackRate`, so both are set.

---

## Where the data comes from

**The text ships with the app, and so do the fonts.** All 6236 verses and all five translations
live in `public/data/`, and every face the app sets type in lives in `public/fonts/` — nothing
is fetched from a text API, a font CDN or a stylesheet host at runtime. Switching surahs is a
memory read, so it is instant, and everything but the recitation works offline.

The files are generated, not written by hand:

```bash
npm run fetch:quran   # the text
npm run fetch:mushaf  # the Mushaf page layout
npm run fetch:fonts   # both sets of fonts
```

`fetch:quran` downloads everything from [alquran.cloud](https://alquran.cloud/api) in six
requests, normalizes it, checks it, and writes `public/data/`. `fetch:fonts` mirrors the 48
QCF V4 faces and the five interface faces into `public/fonts/`. All three are deliberately
**not** part of the build — a build must not depend on the network. See `public/data/README.md`
and `public/fonts/README.md` for the sources and their terms.

Sizes: 1.3 MB of Arabic (265 KB gzipped, loaded once at startup), 756 KB–1.1 MB per translation
fetched the first time you pick that edition, 2.3 MB of interface fonts of which a browser
downloads only the subsets it needs, and 36 MB of Mushaf faces of which a sitting touches a few.

**Audio is the exception** and still comes from `cdn.islamic.network` — one MP3 per verse,
addressed by the *global* ayah number (1–6236), not the number within the surah. A full
recitation runs to about 1.5 GB per reciter, which is not something to ship. Playback therefore
still needs a connection; the text does not.

### Stored keys

| Key | Contents |
|---|---|
| `hifz_learned` | `{ surahNumber: [verseNumber, …] }` — the memorization progress |
| `hifz_review` | `{ version, units: [{ kind, ref, card, addedAt, lastGrade }] }` — the review rotation. `kind` is `page` or `surah` and `ref` the number of one; `card` is the FSRS state. **The array order is the record**: "the last three units" is a slice, which survives a timezone change and a wrong clock in a way a sort by date would not |
| `hifz_selection` | `{ surah, start, end }` — one selection at a time |
| `hifz_reciter` | Edition id of the reciter |
| `hifz_verse_repeat` | Repeats per verse |
| `hifz_pause_factors` | `{ reciterId: factor }` — the pause after the block |
| `hifz_verse_pause_factors` | `{ reciterId: factor }` — the pause after each verse |
| `hifz_playback_rate` | Playback speed |
| `hifz_show_translation`, `hifz_translation` | Translation on/off and edition id |
| `hifz_arabic_font` | Id of the Arabic face, matching a `[data-arabic-font]` rule in `index.css` |
| `hifz_view` | `list` or `mushaf` |

`hifz_pause_factor` (singular) is only read once, to migrate a value from when the pause factor
was still shared across reciters.

---

## Known limitations

- **Playback never stops on its own.** There is no "play once and stop" — a block always starts
  over. Listening to a whole surah straight through is therefore not really available; you would
  have to drag-select all 286 verses of Al-Baqara.
- **Text in the verse list cannot be selected or copied.** Native text selection is suppressed so
  that dragging picks verses instead of highlighting words. In the Mushaf view it could not work
  anyway: those characters are per-page glyph codes, not Arabic.
- **A drill is not resumable.** Closing one throws the pass away — it asks first, and says how far
  in you are. Storing it would be a claim about what was recited, which is the one thing this
  feature must not get wrong. A long surah is therefore a long sitting; the pages are there for
  when that is too much.
- **The Mushaf view shows no progress marks.** The band above each surah is the Complex's own
  calligraphic glyph, but only the name — the frame drawn around it in the print is not in the
  font, and is not reproduced.
- **Progress is local to one browser.** No account, no sync, no export — clearing site data
  clears it.
- **No way to reset all progress at once.** A surah marked by accident can be unmarked with the
  same button, but there is no global reset.
- **Playback still needs a connection.** The text is local, the recitation is not — about 1.5 GB
  per reciter is too much to ship. Read and mark verses offline; hearing them needs the network.
