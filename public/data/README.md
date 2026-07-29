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

## Sources and terms

**Arabic text** — the Uthmani text of the [Tanzil](https://tanzil.net) project, served through
alquran.cloud. Tanzil asks that the text be distributed unmodified and with attribution. Note
that this copy is *structurally* altered as described above: no verse text was edited, but the
basmala was detached from the opening verses.

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
