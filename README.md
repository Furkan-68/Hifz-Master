# Hifz Master

A Qur'an memorization companion. Pick a range of verses by dragging across them, then drill
that block on a loop — with per-verse repeats, a pause sized to what you just heard,
adjustable playback speed, and a record of what you already know.

Runs entirely in the browser. No account, no backend, no API key.

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

**Pause proportional to the material.** Instead of a fixed number of seconds, the silence is a
multiple (0–3×) of how long one pass through the block actually took — measured while it
plays, so it accounts for the playback speed. A one-verse block gets a pause the length of that
verse; a five-verse block gets five times as much. Because reciters differ in tempo, the factor
is **saved per reciter**.

**Playback speed.** 0.5× to 2×. Pitch is preserved, so slowing down does not distort the maqam.

**English translation (optional).** Off by default. Switch it on in the settings panel and pick
one of five editions — Talal Itani's *Clear Qur'an*, Saheeh International, Pickthall, Yusuf Ali,
or Muhammad Asad. The translation appears under each verse and is cached per surah and edition.

**Track what you have learned.** Mark a single verse with the check button on its card, the
whole current block from the practice bar, or an entire surah from the sidebar. Each surah row
shows `learned/total` and a hairline progress bar; the sidebar header shows the overall count.

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
| `services/quranApi.ts` | The four API calls and the audio URL builder |
| `types.ts` | `Surah`, `Ayah`, `SurahDetail`, `AyahRange`, `Reciter` |

### The playback engine

One state machine drives everything. `activeRange` is the drag selection, or the current verse
when there is none, and `handleAudioEnd` walks it: repeat the verse `n` times → advance → at the
end of the block, measure the pass, wait `pass × factor`, start over.

Two things in there are load-bearing and easy to break:

- **Playback intent lives in a ref, not in state.** The media element fires `pause` immediately
  before `ended`, which would wipe a state flag before the effect that advances to the next
  verse could read it.
- **`playbackRate` is re-applied after every source change.** The media load algorithm resets
  it to `defaultPlaybackRate`, so both are set.

---

## Where the data comes from

- **Text and metadata:** [alquran.cloud](https://alquran.cloud/api) — surah list, verses, and
  the translation editions.
- **Audio:** `cdn.islamic.network`, one MP3 per verse, addressed by the *global* ayah number
  (1–6236), not the number within the surah.

Both are public and keyless. A wrong translation identifier does **not** return an error — the
API answers `200` and quietly falls back to the plain Arabic text, so `fetchTranslation`
verifies the identifier of what came back.

### Stored keys

| Key | Contents |
|---|---|
| `hifz_learned` | `{ surahNumber: [verseNumber, …] }` — the memorization progress |
| `hifz_selection` | `{ surah, start, end }` — one selection at a time |
| `hifz_reciter` | Edition id of the reciter |
| `hifz_verse_repeat` | Repeats per verse |
| `hifz_pause_factors` | `{ reciterId: factor }` |
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
