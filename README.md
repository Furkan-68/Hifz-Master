# todo
- Review Modus, Leerzeichen um die nächste Ayah anzuzeigen
- Seitenansicht mit korrektem Page break
- Pause anch jedem Vers oder nach dem Block
- Korrektur beim Lesen AI gestützt 

# Hifz Master

A Qur'an memorization companion. Pick a range of verses by dragging across them, then drill
that block on a loop — with per-verse repeats, a pause sized to what you just heard,
adjustable playback speed, and a record of what you already know.

Runs entirely in the browser. No account, no backend, no API key. The text ships with the app —
only the recitation comes off the network.

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

**Track what you have learned.** Mark a single verse with the check button on its card, or an
entire surah from the sidebar. Each surah row shows `learned/total` and a hairline progress bar;
the sidebar header shows the overall count.

Everything — selection, settings and progress — is kept in the browser's `localStorage`.

---

## Running it

**Prerequisites:** Node.js

```bash
npm install
npm run dev
```

The dev server listens on port `3000` and binds `0.0.0.0`, so the app is also reachable from
another device on the same network (useful for testing the touch gestures on a phone). Both are
set in `vite.config.ts`.

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server with hot reload |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the built output |
| `npm run fetch:quran` | Re-download the text into `public/data/` (rarely needed — see below) |
| `npx tsc --noEmit` | Type check (not part of the build — Vite transpiles without checking) |

There is no test suite.

---

## How it is put together

React 19 + TypeScript, bundled by Vite. Tailwind comes from a CDN `<script>` in `index.html`,
so there is no CSS build step and no `tailwind.config.js` — utility classes are written inline.
Icons are `lucide-react`. State is plain `useState`; there is no state management library.

| File | Role |
|---|---|
| `App.tsx` | Everything stateful: playback engine, settings, sidebar, practice bar |
| `components/AyahRow.tsx` | One verse card. Memoized — a drag updates the range every pointer frame, and Al-Baqara has 286 rows |
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

**The text ships with the app.** All 6236 verses and all five translations live in
`public/data/` — nothing is fetched from a text API at runtime. Switching surahs is a memory
read, so it is instant and works offline.

The files are generated, not written by hand:

```bash
npm run fetch:quran
```

That downloads everything from [alquran.cloud](https://alquran.cloud/api) in six requests,
normalizes it, checks it, and writes `public/data/`. It is deliberately **not** part of the
build — a build must not depend on the network. See `public/data/README.md` for what it
normalizes, and for the sources and their terms.

Sizes: 1.3 MB of Arabic (265 KB gzipped, loaded once at startup) and 756 KB–1.1 MB per
translation, fetched the first time you pick that edition.

**Audio is the exception** and still comes from `cdn.islamic.network` — one MP3 per verse,
addressed by the *global* ayah number (1–6236), not the number within the surah. A full
recitation runs to about 1.5 GB per reciter, which is not something to ship. Playback therefore
still needs a connection; the text does not.

### Stored keys

| Key | Contents |
|---|---|
| `hifz_learned` | `{ surahNumber: [verseNumber, …] }` — the memorization progress |
| `hifz_selection` | `{ surah, start, end }` — one selection at a time |
| `hifz_reciter` | Edition id of the reciter |
| `hifz_verse_repeat` | Repeats per verse |
| `hifz_pause_factors` | `{ reciterId: factor }` — the pause after the block |
| `hifz_verse_pause_factors` | `{ reciterId: factor }` — the pause after each verse |
| `hifz_playback_rate` | Playback speed |
| `hifz_show_translation`, `hifz_translation` | Translation on/off and edition id |

`hifz_pause_factor` (singular) is only read once, to migrate a value from when the pause factor
was still shared across reciters.

---

## Known limitations

- **Playback never stops on its own.** There is no "play once and stop" — a block always starts
  over. Listening to a whole surah straight through is therefore not really available; you would
  have to drag-select all 286 verses of Al-Baqara.
- **Text in the verse list cannot be selected or copied.** Native text selection is suppressed so
  that dragging picks verses instead of highlighting words.
- **Progress is local to one browser.** No account, no sync, no export — clearing site data
  clears it.
- **No way to reset all progress at once.** A surah marked by accident can be unmarked with the
  same button, but there is no global reset.
- **Playback still needs a connection.** The text is local, the recitation is not — about 1.5 GB
  per reciter is too much to ship. Read and mark verses offline; hearing them needs the network.
