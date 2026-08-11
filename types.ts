
export interface Surah {
  number: number;
  name: string;
  englishName: string;
  englishNameTranslation: string;
  numberOfAyahs: number;
  revelationType: string;
}

export interface Ayah {
  number: number;       // global, 1-6236 - this is what addresses the audio file
  numberInSurah: number;
  text: string;
}

export interface SurahDetail extends Surah {
  ayahs: Ayah[];
}

/**
 * One printed line of the Madinah Mushaf.
 *
 * A *run* is `[global ayah number, glyphs]` - the consecutive words of one ayah within one
 * line. It becomes exactly one span, which is what lets a range be selected by word without a
 * span per word: a run never mixes two ayahs and never crosses a line break.
 *
 * The glyphs are not Arabic. Each addresses one word in the QCF font that draws this page and
 * means nothing in any other; see public/data/README.md. That holds for the two ornamental
 * kinds as well - they carry a glyph rather than text, and each is set in a font of its own.
 */
export type MushafLine =
  | { type: 'ayah'; runs: [number, string][] }
  | { type: 'surah'; sura: number; glyph: string }   // the band naming a surah
  // The basmala's glyph is what the source names, kept so the layout stays a faithful record of
  // it. It is not what gets drawn: three of the codes it uses are not usable basmalas in any of
  // the 47 faces, so the renderer draws BASMALA_GLYPH instead. See services/mushaf.ts.
  | { type: 'bismillah'; glyph: string }
  | { type: 'blank' };                               // page margins

// Global ayah numbers rather than indices into one surah: a Mushaf page runs across surah
// boundaries, and so may a range selected on it.
export interface AyahRange {
  start: number; // global ayah number, 1-6236, inclusive
  end: number;   // global ayah number, 1-6236, inclusive, always >= start
}
