
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

export interface AyahRange {
  start: number; // 0-based index into SurahDetail.ayahs, inclusive
  end: number;   // 0-based index into SurahDetail.ayahs, inclusive, always >= start
}
