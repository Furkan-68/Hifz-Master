
import { MushafLine } from '../types';

/**
 * The page-faithful Madinah Mushaf: its layout, and the fonts that draw it.
 *
 * Two things come from elsewhere than the rest of the app:
 *
 * - The layout ships with the app but is *not* loaded at startup. It is 697 KB that only the
 *   Mushaf view needs, and the list view must keep opening as fast as it does.
 * - The fonts are fetched from a CDN, one file per page. All 604 come to about 30 MB, which is
 *   far too much to vendor for a view that shows a handful of pages per sitting. Pinned to a
 *   commit rather than a branch, so the bytes cannot change under us.
 */

const LAYOUT_URL = `${import.meta.env.BASE_URL}data/mushaf-v2.json`;

// QCF V2 - the 1423 H Madinah print. It has to be V2 specifically: the layout addresses words
// through the API's `code_v2`, and a V1 font maps the very same codepoints to different words,
// so mixing the two produces fluent nonsense rather than an obvious error.
//
// TrueType rather than woff2, and pinned to a commit rather than a branch. quran.com serves V2
// as woff2 at a fifth of the size, but without an Access-Control-Allow-Origin header, and the
// FontFace API will not touch a cross-origin font without one. No mirror publishes V2 as woff2.
// So: 160-620 KB for the first visit to a page, cached by the browser from then on.
const FONT_BASE = 'https://cdn.jsdelivr.net/gh/nuqayah/qpc-fonts@8a4f39d563ea69c994416a1692827e38156c548d/mushaf-v2';

export const MUSHAF_PAGES = 604;

/** The family name a page's glyphs have to be set in. Only meaningful once its font is loaded. */
export const pageFontFamily = (page: number) => `QCF_P${String(page).padStart(3, '0')}`;

let pages: MushafLine[][] | null = null;
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
        return response.json() as Promise<MushafLine[][]>;
      })
      .then((data) => {
        const index = new Map<number, number>();
        data.forEach((lines, i) => {
          for (const line of lines) {
            if (line.type !== 'ayah') continue;
            for (const [ayah] of line.runs) {
              // First page wins: a verse spanning a page break belongs to the page it starts on.
              if (!index.has(ayah)) index.set(ayah, i + 1);
            }
          }
        });
        pages = data;
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
  if (!pages || !pageOfAyah) throw new Error('The Mushaf layout is not loaded yet - await loadMushaf() first');
  return { pages, pageOfAyah };
};

export const getMushafPage = (page: number): MushafLine[] => {
  const { pages: all } = loaded();
  const lines = all[page - 1];
  if (!lines) throw new Error(`No Mushaf page numbered ${page}`);
  return lines;
};

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

const fonts = new Map<number, Promise<void>>();

/**
 * Loads one page's font. Concurrent callers share the request, and a page already loaded
 * resolves immediately - so calling this on every render of a page is fine.
 */
export const loadPageFont = (page: number): Promise<void> => {
  let pending = fonts.get(page);
  if (!pending) {
    const file = `${FONT_BASE}/QCF2${String(page).padStart(3, '0')}.ttf`;
    const face = new FontFace(pageFontFamily(page), `url(${file}) format("truetype")`);
    pending = face
      .load()
      .then((loadedFace) => {
        document.fonts.add(loadedFace);
      })
      .catch((err) => {
        // Forgotten, so turning back to this page tries again rather than staying blank.
        fonts.delete(page);
        throw err;
      });
    fonts.set(page, pending);
  }
  return pending;
};

/** Fetches a neighbour's font in the background, so turning the page does not stall. */
export const warmPageFont = (page: number): void => {
  if (page < 1 || page > MUSHAF_PAGES) return;
  loadPageFont(page).catch(() => {
    /* a neighbour that fails to arrive early is not worth reporting */
  });
};
