
import { Surah, SurahDetail, Ayah } from '../types';

// The text ships with the app, in public/data. Regenerate it with `npm run fetch:quran`.
// Everything the API used to need cleaning up - the basmala glued to ayah 1, the BOM in front
// of Al-Fatiha - is already handled there, so nothing is normalized at runtime.
const DATA_URL = `${import.meta.env.BASE_URL}data`;

let surahs: Surah[] | null = null;
let verses: string[][] | null = null;
// Global ayah number of the verse *before* each surah. The audio files are addressed by that
// number (1-6236), so it is the one thing here that must not drift.
let globalOffsets: number[] | null = null;

let loading: Promise<void> | null = null;

const getJson = async <T>(file: string): Promise<T> => {
  const response = await fetch(`${DATA_URL}/${file}`);
  if (!response.ok) throw new Error(`Failed to load ${file}: HTTP ${response.status}`);
  return (await response.json()) as T;
};

/**
 * Reads the bundled text into memory. Idempotent - concurrent callers share one request, and
 * a failed attempt is forgotten so a later call can try again.
 */
export const loadQuranData = (): Promise<void> => {
  if (!loading) {
    loading = Promise.all([
      getJson<Surah[]>('surahs.json'),
      getJson<string[][]>('quran.json'),
    ])
      .then(([surahList, text]) => {
        let running = 0;
        globalOffsets = surahList.map((surah) => {
          const offset = running;
          running += surah.numberOfAyahs;
          return offset;
        });
        surahs = surahList;
        verses = text;
      })
      .catch((err) => {
        loading = null;
        throw err;
      });
  }
  return loading;
};

const loaded = () => {
  if (!surahs || !verses || !globalOffsets) {
    throw new Error('Quran data is not loaded yet - await loadQuranData() first');
  }
  return { surahs, verses, globalOffsets };
};

export const getSurahs = (): Surah[] => loaded().surahs;

/** Synchronous on purpose: after the initial load, switching surahs must not wait on anything. */
export const getSurahDetail = (surahNumber: number): SurahDetail => {
  const data = loaded();
  const index = surahNumber - 1;
  const surah = data.surahs[index];
  const texts = data.verses[index];
  if (!surah || !texts) throw new Error(`No surah numbered ${surahNumber}`);

  const offset = data.globalOffsets[index];
  const ayahs: Ayah[] = texts.map((text, i) => ({
    number: offset + i + 1,
    numberInSurah: i + 1,
    text,
  }));
  return { ...surah, ayahs };
};

export const TOTAL_AYAHS = 6236;

/**
 * Global ayah number (1-6236) -> the verse and the surah holding it. The counterpart to the
 * numbering `getSurahDetail` hands out, and what lets a range span two surahs.
 */
export const getAyahByNumber = (number: number): { ayah: Ayah; surah: Surah } | null => {
  const data = loaded();
  if (!Number.isInteger(number) || number < 1 || number > TOTAL_AYAHS) return null;

  // 114 entries, so scanning from the back beats maintaining an index of 6236.
  let index = 0;
  for (let i = data.globalOffsets.length - 1; i >= 0; i--) {
    if (number > data.globalOffsets[i]) {
      index = i;
      break;
    }
  }
  const numberInSurah = number - data.globalOffsets[index];
  return {
    surah: data.surahs[index],
    ayah: { number, numberInSurah, text: data.verses[index][numberInSurah - 1] },
  };
};

/**
 * The inverse of `getAyahByNumber`: a verse named the way people name one - surah, then its
 * number within that surah - resolved to the global number everything else here speaks in.
 * Null when that surah does not reach that verse.
 */
export const getGlobalAyahNumber = (surahNumber: number, numberInSurah: number): number | null => {
  const data = loaded();
  const surah = data.surahs[surahNumber - 1];
  if (!surah || numberInSurah < 1 || numberInSurah > surah.numberOfAyahs) return null;
  return data.globalOffsets[surahNumber - 1] + numberInSurah;
};

// One file per edition, fetched the first time that edition is shown and kept afterwards.
const translations = new Map<string, Promise<string[][]>>();

export const fetchTranslation = async (surahNumber: number, edition: string): Promise<string[]> => {
  let pending = translations.get(edition);
  if (!pending) {
    pending = getJson<string[][]>(`translations/${edition}.json`).catch((err) => {
      translations.delete(edition);
      throw err;
    });
    translations.set(edition, pending);
  }
  const texts = (await pending)[surahNumber - 1];
  if (!texts) throw new Error(`Translation "${edition}" has no surah ${surahNumber}`);
  return texts;
};

export const getAyahAudioUrl = (number: number, reciter: string = 'ar.alafasy') => {
  // The only thing still coming off the network: a full recitation is ~1.5 GB per reciter.
  return `https://cdn.islamic.network/quran/audio/128/${reciter}/${number}.mp3`;
};
