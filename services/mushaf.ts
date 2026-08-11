
import { MushafLine } from '../types';

/**
 * The page-faithful Madinah Mushaf: its layout, and the fonts that draw it.
 *
 * The edition is the 1441 H print, the one the Complex sells today. Its line breaks differ
 * from the 1421 H print on 355 of the 604 pages; which verses a page holds differs on none,
 * which is why a stored review unit of kind `page` still means what it always meant.
 *
 * Both of the things this needs ship with the app, and neither is loaded at startup:
 *
 * - The layout is 687 KB that only the Mushaf view needs, and the list view must keep opening
 *   as fast as it does.
 * - The fonts come to about 36 MB across 48 files, so they are fetched a face at a time as
 *   pages ask for them. One face covers 6-15 consecutive pages, so a sitting pulls a handful.
 */

const LAYOUT_URL = `${import.meta.env.BASE_URL}data/mushaf-v4.json`;

// QCF V4 - the 1441 H Madinah print. It has to be V4 specifically: the layout addresses words
// through that edition's glyph codes, and a V1 or V2 font maps the very same codepoints to
// different words, so mixing them produces fluent nonsense rather than an obvious error.
//
// woff2, so the first visit to a *stretch* of pages costs 360-924 KB rather than triple that.
// Put here by `npm run fetch:fonts`, from the same pinned commit the layout comes from; see
// public/fonts/README.md.
const FONT_BASE = `${import.meta.env.BASE_URL}fonts/qcf4`;

export const MUSHAF_PAGES = 604;

/** The band naming a surah is drawn from one font for the whole Mushaf, not per page. */
export const BAND_FAMILY = 'QCF4_QBSML';

/**
 * The glyph the basmala line is drawn with - not the one the layout carries.
 *
 * The source names a basmala code per page: U+F8D6 on 109 of the 112 openings, U+F8D7 on two,
 * U+F8DD on one. Only the last of those is a basmala anyone can use. U+F8D6 and U+F8D7 exist
 * in exactly one of the 47 faces, QCF4_Hafs_01, and what they draw there is two half-basmalas
 * laid on top of each other - a smear of overlapping strokes rather than a line of text. It is
 * not a fault in how we set them: the upstream project's own demo draws the same smear.
 *
 * U+F8DD is the whole basmala in one glyph, and every face carries it, byte for byte the same
 * one: advance 6.369 em, ink from 0.175 to 6.275 em, so it also sits centred in its own box
 * and needs no nudging. Taking it from the page's own font rather than borrowing a face means
 * an opening page pulls no file it would not have pulled anyway.
 */
export const BASMALA_GLYPH = '\uF8DD';

interface Layout {
  /** Page -> the number of the QCF4_Hafs face that draws it. One face covers 6-15 pages. */
  pageFont: number[];
  pages: MushafLine[][];
}

let layout: Layout | null = null;
// Global ayah number -> the page it starts on. Built once, so jumping from the list view to
// the page holding a verse is a lookup rather than a scan of 604 pages.
let pageOfAyah: Map<number, number> | null = null;
let loading: Promise<void> | null = null;

/** Reads the layout into memory. Idempotent; a failed attempt is forgotten so a retry works. */
export const loadMushaf = (): Promise<void> => {
  if (!loading) {
    loading = fetch(LAYOUT_URL)
      .then((response) => {
        if (!response.ok) throw new Error(`Failed to load the Mushaf layout: HTTP ${response.status}`);
        return response.json() as Promise<Layout>;
      })
      .then((data) => {
        const index = new Map<number, number>();
        data.pages.forEach((lines, i) => {
          for (const line of lines) {
            if (line.type !== 'ayah') continue;
            for (const [ayah] of line.runs) {
              // First page wins: a verse spanning a page break belongs to the page it starts on.
              if (!index.has(ayah)) index.set(ayah, i + 1);
            }
          }
        });
        layout = data;
        pageOfAyah = index;
      })
      .catch((err) => {
        loading = null;
        throw err;
      });
  }
  return loading;
};

const loaded = () => {
  if (!layout || !pageOfAyah) throw new Error('The Mushaf layout is not loaded yet - await loadMushaf() first');
  return { layout, pageOfAyah };
};

export const getMushafPage = (page: number): MushafLine[] => {
  const lines = loaded().layout.pages[page - 1];
  if (!lines) throw new Error(`No Mushaf page numbered ${page}`);
  return lines;
};

/** The family a page's word glyphs have to be set in. Only meaningful once its font is loaded. */
export const pageFontFamily = (page: number): string => {
  const face = loaded().layout.pageFont[page - 1];
  return `QCF4_Hafs_${String(face).padStart(2, '0')}`;
};

/** The family a line's glyph is set in. Only the band breaks with its page; see BASMALA_GLYPH. */
export const lineFontFamily = (line: MushafLine, page: number): string =>
  line.type === 'surah' ? BAND_FAMILY : pageFontFamily(page);

export const getPageOfAyah = (ayah: number): number => loaded().pageOfAyah.get(ayah) ?? 1;

/** First and last ayah printed on a page, so playback can be held to what is on screen. */
export const getPageRange = (page: number): { start: number; end: number } | null => {
  let start = Infinity;
  let end = -Infinity;
  for (const line of getMushafPage(page)) {
    if (line.type !== 'ayah') continue;
    for (const [ayah] of line.runs) {
      if (ayah < start) start = ayah;
      if (ayah > end) end = ayah;
    }
  }
  return end < start ? null : { start, end };
};

// --- fonts --------------------------------------------------------------------------------

const fonts = new Map<string, Promise<void>>();

/** Loads one family. Concurrent callers share the request; one already loaded resolves at once. */
const loadFamily = (family: string): Promise<void> => {
  let pending = fonts.get(family);
  if (!pending) {
    const file = `${FONT_BASE}/${family}${family === BAND_FAMILY ? '' : '_W'}.woff2`;
    const face = new FontFace(family, `url(${file}) format("woff2")`);
    pending = face
      .load()
      .then((loadedFace) => {
        document.fonts.add(loadedFace);
      })
      .catch((err) => {
        // Forgotten, so turning back to this page tries again rather than staying blank.
        fonts.delete(family);
        throw err;
      });
    fonts.set(family, pending);
  }
  return pending;
};

/** Every family a page needs: its own, plus the band's where it opens a surah. */
const familiesOf = (page: number): string[] => {
  const families = new Set([pageFontFamily(page)]);
  for (const line of getMushafPage(page)) {
    if (line.type === 'surah') families.add(lineFontFamily(line, page));
  }
  return [...families];
};

/**
 * Loads everything one page is set in. Resolves only when all of it is there - a page half in
 * its font is worse than a page still blank.
 *
 * A page opening a surah needs two files rather than one: its own and the band's. The basmala
 * used to make it three; it now comes out of the page's own face.
 *
 * Cheap to call on every render: a face already loaded resolves immediately, and one file
 * covers six to fifteen consecutive pages, so most page turns need no request at all.
 */
export const loadPageFont = (page: number): Promise<void> =>
  Promise.all(familiesOf(page).map(loadFamily)).then(() => undefined);

/** Fetches a neighbour's fonts in the background, so turning the page does not stall. */
export const warmPageFont = (page: number): void => {
  if (page < 1 || page > MUSHAF_PAGES) return;
  loadPageFont(page).catch(() => {
    /* a neighbour that fails to arrive early is not worth reporting */
  });
};
