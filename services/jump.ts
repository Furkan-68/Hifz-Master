import { Surah } from '../types';
import { MUSHAF_PAGES } from './mushaf';

/**
 * Where a jump lands.
 *
 * Every query the palette understands comes down to one of these three, and each is something
 * a view can already show: a surah is opened at its first verse, an ayah moves the cursor, a
 * page turns the Mushaf. Nothing here is resolved to a global ayah number - that is the
 * caller's job, and keeps this module a pure function of its arguments.
 */
export type JumpTarget =
  | { kind: 'surah'; surah: Surah }
  | { kind: 'ayah'; surah: Surah; numberInSurah: number }
  | { kind: 'page'; page: number };

const MAX_RESULTS = 8;

/**
 * A name folded down to what someone is actually likely to type.
 *
 * The bundled names are one romanisation among many - "Al-Faatiha", "An-Naas", "Al-Mu'minoon" -
 * and next to nobody types the doubled vowels. So everything that is not a letter goes, runs
 * of one letter collapse, and the three pairs romanisations disagree about most are flattened:
 * e/i, o/u and q/k. That is what lets "fatiha", "al-faatihah" and "Al Fatiha" all reach the
 * same surah, and "bakara" reach Al-Baqara.
 */
const foldLatin = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z]+/g, '')
    .replace(/(.)\1+/g, '$1')
    .replace(/e/g, 'i')
    .replace(/o/g, 'u')
    .replace(/q/g, 'k');

/**
 * The Arabic name as it would be typed rather than as the Mushaf sets it: the harakat come
 * off, the alef variants are levelled, and the "سورة" every record carries in front is
 * dropped so that what is matched is the name itself.
 */
const foldArabic = (s: string) =>
  s
    // Harakat, the small marks above 06D6, and the tatweel that only stretches a joint.
    .replace(/[\u064B-\u0652\u0670\u0640\u06D6-\u06ED]/g, '')
    .replace(/[\u0622\u0623\u0625\u0671]/g, '\u0627') // آ أ إ ٱ -> ا
    .replace(/\u0629/g, '\u0647')                     // ة -> ه
    .replace(/\u0649/g, '\u064A')                     // ى -> ي
    .replace(/^\s*\u0633\u0648\u0631\u0629\s*/, '')   // the leading "سورة"
    .replace(/\s+/g, '');

const hasArabic = (s: string) => /[\u0600-\u06FF]/.test(s);

const latinWords = (s: string) =>
  s.split(/[^A-Za-z]+/).map(foldLatin).filter(Boolean);

interface Folded {
  surah: Surah;
  name: string;     // the whole English name, folded
  words: string[];  // its words, each folded on its own
  arabic: string;
  meaning: string[];// the words of what the name means, folded
}

const foldSurah = (surah: Surah): Folded => ({
  surah,
  name: foldLatin(surah.englishName),
  words: latinWords(surah.englishName),
  arabic: foldArabic(surah.name),
  meaning: latinWords(surah.englishNameTranslation),
});

// 114 records folded five ways is not much, but it would be done on every keystroke. The
// surah list is one frozen array for the life of the app, so its identity is the cache key.
let cache: { source: Surah[]; table: Folded[] } | null = null;
const foldedTable = (surahs: Surah[]): Folded[] => {
  if (!cache || cache.source !== surahs) cache = { source: surahs, table: surahs.map(foldSurah) };
  return cache.table;
};

/**
 * How well a surah answers to a typed name. Lower is better, -1 is no answer at all.
 *
 * The order is what makes the list useful rather than merely correct. A word typed whole
 * outranks a word merely begun - which is what puts An-Naas above An-Nasr for "nas" - and a
 * name begun outranks one that only contains what was typed. What a name *means* comes last:
 * a nice way in when it is all you can remember, but never what someone typing a name was
 * after.
 */
const score = (f: Folded, latin: string, arabic: string): number => {
  if (arabic) return f.arabic.startsWith(arabic) ? 0 : f.arabic.includes(arabic) ? 1 : -1;
  if (!latin) return -1;
  if (f.words.includes(latin)) return 0;
  if (f.name.startsWith(latin)) return 1;
  if (f.words.some((w) => w.startsWith(latin))) return 2;
  if (f.name.includes(latin)) return 3;
  if (f.meaning.some((w) => w.startsWith(latin))) return 4;
  return -1;
};

// Said in words, because a bare number is read as a surah first and there would otherwise be
// no way to ask for the page of that number. German alongside English: the app is written in
// English but this is a thing you type, not a thing you read.
const PAGE_QUERY = /^(?:p|pg|page|seite)[\s.:]*(\d+)$/i;
// "2:255", "2.255", "2-255", "2 255" - one verse, named by number.
const VERSE_QUERY = /^(\d+)\s*[:.\-/ ]\s*(\d+)$/;
// A name with a verse behind it: "Baqara 255", "an-nas:3". The lazy head is what keeps the
// number out of the name; a surah name never ends in a digit, so nothing else can match here.
const NAMED_VERSE_QUERY = /^(.*?)[\s:.\-/]*(\d+)$/;

/**
 * What a typed query could mean, best first.
 *
 * A single reading is returned where the query has one; an ambiguous query returns every
 * reading rather than guessing, which is why a bare "2" offers both Al-Baqara and page 2.
 */
export const findJumpTargets = (query: string, surahs: Surah[]): JumpTarget[] => {
  const q = query.trim();
  if (!q || surahs.length === 0) return [];

  const pageTarget = (n: number): JumpTarget[] =>
    Number.isInteger(n) && n >= 1 && n <= MUSHAF_PAGES ? [{ kind: 'page', page: n }] : [];

  // A verse number the surah does not reach still points at the surah rather than at nothing:
  // of the two numbers, the verse is the one more easily got wrong.
  const inSurah = (surah: Surah, ayah: number | null): JumpTarget =>
    ayah !== null && ayah >= 1 && ayah <= surah.numberOfAyahs
      ? { kind: 'ayah', surah, numberInSurah: ayah }
      : { kind: 'surah', surah };

  const explicitPage = q.match(PAGE_QUERY);
  if (explicitPage) return pageTarget(Number(explicitPage[1]));

  const byNumber = q.match(VERSE_QUERY);
  if (byNumber) {
    const surah = surahs[Number(byNumber[1]) - 1];
    return surah ? [inSurah(surah, Number(byNumber[2]))] : [];
  }

  if (/^\d+$/.test(q)) {
    const n = Number(q);
    const surah = surahs[n - 1];
    // Surah first: this sits above the surah list, and that is the reading it is there for.
    return [...(surah ? [{ kind: 'surah' as const, surah }] : []), ...pageTarget(n)];
  }

  const named = q.match(NAMED_VERSE_QUERY);
  const name = named && named[1].trim() ? named[1] : q;
  const ayah = named && named[1].trim() ? Number(named[2]) : null;

  const arabic = hasArabic(name) ? foldArabic(name) : '';
  const latin = arabic ? '' : foldLatin(name);
  if (!latin && !arabic) return [];

  return foldedTable(surahs)
    .map((f) => ({ f, rank: score(f, latin, arabic) }))
    .filter((m) => m.rank >= 0)
    // Equally good matches come back in the order they are printed in, which is the order
    // whoever typed the name is holding them in.
    .sort((a, b) => a.rank - b.rank || a.f.surah.number - b.f.surah.number)
    .slice(0, MAX_RESULTS)
    .map((m) => inSurah(m.f.surah, ayah));
};
