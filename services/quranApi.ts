
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

export const fetchReciters = async (): Promise<Reciter[]> => {
  const response = await fetch(`${BASE_URL}/edition?format=audio&language=ar&type=versebyverse`);
  const data = await response.json();
  return data.data;
};

export const getAyahAudioUrl = (number: number, reciter: string = 'ar.alafasy') => {
  // Using a faster CDN for audio when possible
  return `https://cdn.islamic.network/quran/audio/128/${reciter}/${number}.mp3`;
};
