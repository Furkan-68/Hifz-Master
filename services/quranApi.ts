
import { Surah, SurahDetail, Reciter } from '../types';

const BASE_URL = 'https://api.alquran.cloud/v1';

export const fetchSurahs = async (): Promise<Surah[]> => {
  const response = await fetch(`${BASE_URL}/surah`);
  const data = await response.json();
  return data.data;
};

export const fetchSurahDetail = async (surahNumber: number, reciterIdentifier: string = 'ar.alafasy'): Promise<SurahDetail> => {
  const response = await fetch(`${BASE_URL}/surah/${surahNumber}/${reciterIdentifier}`);
  const data = await response.json();
  return data.data;
};

export const fetchTranslation = async (surahNumber: number, edition: string): Promise<string[]> => {
  const response = await fetch(`${BASE_URL}/surah/${surahNumber}/${edition}`);
  const payload = await response.json();
  const data = payload?.data;
  // An unknown identifier does not error out - the API answers 200 and quietly falls back
  // to quran-simple, which would put Arabic in the translation slot. Check what came back.
  if (!Array.isArray(data?.ayahs) || data.edition?.identifier !== edition) {
    throw new Error(`Translation "${edition}" is unavailable`);
  }
  return data.ayahs.map((ayah: { text: string }) => ayah.text);
};

export const fetchReciters = async (): Promise<Reciter[]> => {
  const response = await fetch(`${BASE_URL}/edition?format=audio&language=ar&type=versebyverse`);
  const data = await response.json();
  return data.data;
};

export const getAyahAudioUrl = (number: number, reciter: string = 'ar.alafasy') => {
  // Using a faster CDN for audio when possible
  return `https://cdn.islamic.network/quran/audio/128/${reciter}/${number}.mp3`;
};
