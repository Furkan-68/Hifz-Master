# Bundled Qur'an text

Generated files — do not edit them by hand. To refresh:

```bash
npm run fetch:quran
```

Downloaded from the [alquran.cloud](https://alquran.cloud/api) API on 2026-07-29.
The script (`scripts/fetch-quran.mjs`) refuses to write anything that fails its checks.

| File | Contents |
|---|---|
| `surahs.json` | 114 surahs: number, both names, verse count, revelation type |
| `quran.json` | Arabic text, `string[][]` — surah index, then verse index |
| `translations/<edition>.json` | One English edition, same shape |
| `mushaf-v2.json` | The page layout of the printed Madinah Mushaf — see below |

Verse numbers are not stored. `numberInSurah` is the array index + 1, and the global number
(1–6236, which addresses the audio file) is the running count derived from `numberOfAyahs` —
see `getSurahDetail` in `services/quranApi.ts`.

## What the script changes

- **The basmala is removed from verse 1** of the 112 surahs where the API delivers it glued to
  the opening verse. The app prints it as a heading above the list, so keeping it would show it
  twice. Al-Fatiha keeps it — there it is verse 1 in its own right — At-Tawba has none, and the
  basmala inside An-Naml 27:30 stays where it belongs.
- A byte-order mark that the API puts in front of Al-Fatiha 1:1 is removed, and each verse is
  trimmed.

Nothing else is touched. All 6236 verses of every edition were compared against the API after
generation; apart from the removals above they match byte for byte.

## The Mushaf layout

`mushaf-v2.json` is generated separately and describes the printed page rather than the text:

```bash
npm run fetch:mushaf
```

604 requests to the [quran.com API](https://api.quran.com/api/v4), about a minute. Shape: 604
pages, each an array of its printed lines, one JSON line per printed line.

```json
{"type":"ayah","runs":[[6231,"ﭑ ﭒ ﭓ"],[6232,"ﭔ"]]}
{"type":"blank"}
```

A **run** is `[global ayah number, glyphs]` — the consecutive words of one ayah within one line.
It becomes exactly one span in the DOM, which is what lets a verse range be selected by dragging
across the page: a run never mixes two ayahs and never crosses a line break.

**The glyphs are not Arabic.** Each character addresses one word in *that page's own font*, and
means a different word in any other page's font. `ﭑ` on page 604 is not `ﭑ` on page 1. Nothing
here is searchable, copyable, or convertible back to text — the Unicode text lives in
`quran.json`, and the two cannot be mixed.

`{"type":"blank"}` lines are the ornamental ones that introduce a surah: its name in a band, and
below it the basmala. Which of the two a given blank line carries is left to the renderer,
because the printed gap is one, two, or three lines depending on where the surah falls. Two
surahs — 'Abasa and At-Tariq — get no blank line at all.

The script writes nothing unless every check passes: 604 pages, all 6236 ayahs present, every
surah opening a line of its own, exactly 114 stretches of blank lines, and the same number of
words written as the API returned. That last one matters more than it looks — `code_v2` sometimes
holds two glyphs separated by a space for a single word, so a word count taken by splitting the
finished string comes out 198 too high.

One quirk of the source worth knowing: `by_page/N` answers with the verses that *begin* on page
N, including the words of a verse that spills onto N+1 — numbered from line 1 of that next page.
Every word is therefore filed by its own `page_number`, not by the response it arrived in.

## Sources and terms

**Arabic text** — the Uthmani text of the [Tanzil](https://tanzil.net) project, served through
alquran.cloud. Tanzil asks that the text be distributed unmodified and with attribution. Note
that this copy is *structurally* altered as described above: no verse text was edited, but the
basmala was detached from the opening verses.

**The Mushaf layout** — from the [quran.com API](https://api.quran.com/api/v4), which publishes
the line and page of every word of the Madinah Mushaf together with its QCF glyph code. The
fonts themselves are not stored here; they are fetched per page at runtime, see
`services/mushaf.ts`. They are the work of the King Fahd Glorious Quran Printing Complex, free
to use and distribute but not to modify or sell.

**Translations** — five English editions:

| Edition | Translator | Status |
|---|---|---|
| `en.pickthall` | Marmaduke Pickthall (1930) | old enough to be public domain in most jurisdictions |
| `en.yusufali` | Abdullah Yusuf Ali (1934) | likewise |
| `en.sahih` | Saheeh International | under copyright |
| `en.asad` | Muhammad Asad | under copyright |
| `en.itani` | Talal Itani, *Clear Qur'an* | under copyright |

The last three are included here for personal use. Check their terms before redistributing this
repository publicly or shipping it as a product.
