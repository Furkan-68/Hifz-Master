# Bundled fonts

Generated directories — do not edit them by hand, and do not add a file here that the script
does not produce. To refresh:

```bash
npm run fetch:fonts
```

`scripts/fetch-fonts.mjs` writes both sets and refuses to write anything that fails its checks:
every file has to begin with the woff2 signature, every Mushaf face has to be over 100 KB, and
every family the app can switch to has to be present — the Arabic ones with an arabic subset.

| Path | Contents |
|---|---|
| `qcf4/` | 48 QCF V4 faces — the 47 `QCF4_Hafs_NN_W` that draw the printed pages, plus `QCF4_QBSML` for the surah bands. 36 MB |
| `google/` | The five interface faces, split by weight, style and unicode subset. 65 files, 2.3 MB |
| `google.css` | The Google Fonts stylesheet, mirrored, with its `src` rewritten to `./google/`. Linked from `index.html` |

Nothing here is loaded at startup. The Mushaf faces are pulled one at a time by
`services/mushaf.ts` as pages ask for them, and a face covers six to fifteen consecutive pages,
so a sitting touches a handful of the 48. The interface faces carry `unicode-range`, so a
browser fetches only the subsets the text on screen actually needs.

## Which files to fetch is not written down twice

The QCF4 list is derived from `public/data/mushaf-v4.json` rather than hardcoded: the script
reads the `pageFont` array, takes its distinct values, and checks they run 1 to 47 with no gaps
before it downloads anything. The layout and the faces that draw it therefore cannot drift apart
without the script saying so.

They also come from **the same pinned commit** as the layout — `a51076c` of `quran-qcf4`. This
is not tidiness. A QCF font addresses one glyph per *word* through its own private codes, so a
face from another revision does not fail on a code from this layout; it draws a different word.
The failure mode is fluent nonsense, which is why both are pinned and why they are checked
against each other.

## Sources and terms

**QCF V4** (`qcf4/`) — from [`quran-qcf4`](https://github.com/MohamadHajjRabee/quran-qcf4). Note
that repository's own split: its JSON is MIT, **the fonts are not**. They are the work of the
King Fahd Glorious Quran Printing Complex, calligraphy by Uthman Taha, and are offered for
Quranic rendering. They are copied here unmodified so that the Mushaf view works without a
connection. Check the Complex's terms before redistributing this repository publicly or shipping
it as a product — the same caveat the copyrighted translations in `public/data/` carry.

**The interface faces** (`google/`) — mirrored from the Google Fonts API, all five under the
[SIL Open Font License 1.1](https://openfontlicense.org), which permits self-hosting outright:

| Family | Used for |
|---|---|
| Inter | The whole interface |
| Amiri | `.font-quran`, and one of the four selectable Arabic faces |
| Amiri Quran | A selectable Arabic face |
| Noto Naskh Arabic | A selectable Arabic face |
| Scheherazade New | The default Arabic face |

The four Arabic faces are the ones offered in the settings panel; they are declared, sized and
led in `index.css`. All four render the Uthmani rasm of the bundled Tanzil text correctly, which
is the reason the list is these four and not others.
