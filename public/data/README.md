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
| `mushaf-v4.json` | The page layout of the printed Madinah Mushaf — see below |

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

`mushaf-v4.json` is generated separately and describes the printed page rather than the text:

```bash
npm run fetch:mushaf
```

The edition is the **1441 H print**, the one the Complex sells today — not the 1421 H print the
app set until now. The two differ in where the lines break on 355 of the 604 pages; they differ
on none in which verses a page holds.

605 requests to a pinned commit of [`quran-qcf4`](https://github.com/MohamadHajjRabee/quran-qcf4),
about a minute. Shape: a `pageFont` array and 604 pages, each an array of its printed lines, one
JSON line per printed line.

```json
{"type":"ayah","runs":[[6231,"ﭑ ﭒ ﭓ"],[6232,"ﭔ"]]}
{"type":"surah","sura":114,"glyph":"ﰲ"}
{"type":"bismillah","glyph":""}
{"type":"blank"}
```

A **run** is `[global ayah number, glyphs]` — the consecutive words of one ayah within one line.
It becomes exactly one span in the DOM, which is what lets a verse range be selected by dragging
across the page: a run never mixes two ayahs and never crosses a line break.

**The glyphs are not Arabic.** Each character addresses one word in *the font that draws that
page*, and means a different word in any other. Nothing here is searchable, copyable, or
convertible back to text — the Unicode text lives in `quran.json`, and the two cannot be mixed.
One font covers a stretch of six to fifteen pages, which is what `pageFont` records: entry *n* is
the number of the `QCF4_Hafs_NN` face that draws page *n*.

The two ornamental kinds carry a glyph of their own, so the renderer no longer has to guess which
blank line holds what: 114 surah bands and 112 basmalas (Al-Fatiha counts its basmala as verse 1,
At-Tawba has none). The band is set in `QCF4_QBSML`; the basmala is *not* in the font of the page
it stands on but always in `QCF4_Hafs_01`.

The rub' al-hizb markers — 199 of them — belong to no ayah. Each rides inside the run of the word
it precedes, which keeps the printed order of the line and spares the renderer a third kind of
thing to lay out.

The script writes nothing unless every check passes: 604 pages of at most 15 lines, all 6236
ayahs present, every surah opening a line of its own, 77,448 words, 6236 verse-end marks, 199
quarter marks, 114 bands against 112 basmalas — and, while the previous edition is still on disk,
that every page holds exactly the verses it held before. That last one is what makes the change
safe: a stored review unit of kind `page` still means what it meant.

## Sources and terms

**Arabic text** — the Uthmani text of the [Tanzil](https://tanzil.net) project, served through
alquran.cloud. Tanzil asks that the text be distributed unmodified and with attribution. Note
that this copy is *structurally* altered as described above: no verse text was edited, but the
basmala was detached from the opening verses.

**The Mushaf layout** — from [`quran-qcf4`](https://github.com/MohamadHajjRabee/quran-qcf4),
which publishes the line and page of every word of the 1441 H Madinah Mushaf together with its
QCF4 glyph code. Its JSON is MIT; it was cross-checked against quran.com's own V4 layout
(`mushaf=19`), which agrees with it word for word but publishes no V4 glyph codes of its own.

The fonts that draw this layout are not here but in `public/fonts/qcf4/`, taken from the same
pinned commit. See `public/fonts/README.md` for whose work they are and on what terms.

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
