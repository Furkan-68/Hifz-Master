
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
 * The glyphs are not Arabic. Each addresses one word in that page's own QCF font and means
 * nothing in any other; see public/data/README.md.
 */
export type MushafLine =
  | { type: 'ayah'; runs: [number, string][] }
  | { type: 'blank' }; // the ornamental lines that introduce a surah, and page margins

// Global ayah numbers rather than indices into one surah: a Mushaf page runs across surah
// boundaries, and so may a range selected on it.
export interface AyahRange {
  start: number; // global ayah number, 1-6236, inclusive
  end: number;   // global ayah number, 1-6236, inclusive, always >= start
}
