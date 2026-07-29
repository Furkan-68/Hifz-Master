/**
 * Downloads the Qur'an text from alquran.cloud into public/data/, where the app reads it from.
 *
 *   npm run fetch:quran
 *
 * Run by hand, never as part of the build - a build must not depend on the network. The data
 * only changes when an edition is added, so this runs about once a year.
 *
 * Everything the app would otherwise have to clean up at runtime happens here: the basmala
 * that arrives glued to ayah 1, and the BOM the API puts in front of Al-Fatiha.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE_URL = 'https://api.alquran.cloud/v1';
const ARABIC_EDITION = 'quran-uthmani';
const TRANSLATIONS = ['en.itani', 'en.sahih', 'en.pickthall', 'en.yusufali', 'en.asad'];

const SURAH_COUNT = 114;
const TOTAL_AYAHS = 6236;

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data');

// --- basmala ---------------------------------------------------------------------------

const BASMALA = 'بسم الله الرحمن الرحيم';

// Editions differ in how they vocalise it (alef wasla vs plain alef, superscript alef,
// tatweel), so comparison happens on the bare letters.
const bareLetters = (text) =>
  text
    // marks, superscript alef, small waqf signs, tatweel, BOM
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640\uFEFF]/g, '')
    .replace(/\u0671/g, '\u0627') // alef wasla -> plain alef
    .replace(/\s+/g, '');

/** Removes a basmala glued to the front of a verse. Returns the text unchanged if none. */
const stripLeadingBasmala = (text) => {
  const target = bareLetters(BASMALA);
  let seen = '';
  for (let i = 0; i < text.length; i++) {
    seen += bareLetters(text[i]);
    if (!target.startsWith(seen)) return text; // diverged - this verse just starts similarly
    if (seen === target) {
      // The vowel marks of the last letter trail behind it, so skip everything that carries
      // no letter of its own - marks first, then the space to the next word.
      let end = i + 1;
      while (end < text.length && bareLetters(text[end]) === '') end++;
      const rest = text.slice(end);
      return rest || text; // a verse that is nothing but the basmala keeps its text
    }
  }
  return text;
};

const startsWithBasmala = (text) => bareLetters(text).startsWith(bareLetters(BASMALA));

// --- fetching --------------------------------------------------------------------------

const getData = async (path) => {
  const response = await fetch(`${BASE_URL}${path}`);
  if (!response.ok) throw new Error(`GET ${path} -> HTTP ${response.status}`);
  const payload = await response.json();
  if (!payload?.data) throw new Error(`GET ${path} -> response carries no data`);
  return payload.data;
};

const fetchEdition = async (identifier) => {
  const data = await getData(`/quran/${identifier}`);
  // An unknown identifier does not error out - the API answers 200 and quietly falls back to
  // another edition. Only what actually came back counts.
  if (data.edition?.identifier !== identifier) {
    throw new Error(`asked for edition "${identifier}", got "${data.edition?.identifier}"`);
  }
  return data.surahs;
};

/** surah -> ayah matrix of plain strings. Ayah objects carry six fields the app never reads. */
const toTextMatrix = (surahs, { stripBasmala }) =>
  surahs.map((surah, s) =>
    surah.ayahs.map((ayah, a) => {
      const text = ayah.text.replace(/\uFEFF/g, '').trim(); // Al-Fatiha arrives with a BOM
      // Al-Fatiha is the exception: there the basmala is a verse in its own right.
      return stripBasmala && a === 0 && s !== 0 ? stripLeadingBasmala(text) : text;
    })
  );

// --- checks ----------------------------------------------------------------------------

const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};

const checkShape = (label, matrix, meta) => {
  check(matrix.length === SURAH_COUNT, `${label}: ${matrix.length} surahs, expected ${SURAH_COUNT}`);
  const total = matrix.reduce((n, verses) => n + verses.length, 0);
  check(total === TOTAL_AYAHS, `${label}: ${total} ayahs, expected ${TOTAL_AYAHS}`);
  matrix.forEach((verses, i) => {
    check(
      verses.length === meta[i].numberOfAyahs,
      `${label}: surah ${i + 1} has ${verses.length} ayahs, metadata says ${meta[i].numberOfAyahs}`
    );
    verses.forEach((text, j) => {
      check(typeof text === 'string' && text.length > 0, `${label}: ${i + 1}:${j + 1} is empty`);
    });
  });
};

// --- main ------------------------------------------------------------------------------

// One line per surah: compact enough for 6236 verses, still a readable diff when re-run.
const formatMatrix = (matrix) => `[\n${matrix.map((row) => JSON.stringify(row)).join(',\n')}\n]\n`;

const write = async (name, contents) => {
  const target = join(OUT_DIR, name);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, contents);
  return Buffer.byteLength(contents);
};

const kb = (bytes) => `${(bytes / 1024).toFixed(0)} KB`;

console.log(`Downloading from ${BASE_URL}`);

const surahList = await getData('/surah');
const meta = surahList.map((s) => ({
  number: s.number,
  name: s.name,
  englishName: s.englishName,
  englishNameTranslation: s.englishNameTranslation,
  numberOfAyahs: s.numberOfAyahs,
  revelationType: s.revelationType,
}));
check(meta.length === SURAH_COUNT, `surah list: ${meta.length} entries, expected ${SURAH_COUNT}`);
meta.forEach((s, i) => check(s.number === i + 1, `surah list: entry ${i} is numbered ${s.number}`));

const arabic = toTextMatrix(await fetchEdition(ARABIC_EDITION), { stripBasmala: true });
checkShape(ARABIC_EDITION, arabic, meta);

// The basmala must be gone from every opening verse but Al-Fatiha's, and must survive inside
// An-Naml 27:30, where it is part of Solomon's letter.
arabic.forEach((verses, i) => {
  const isFatiha = i === 0;
  check(
    startsWithBasmala(verses[0]) === isFatiha,
    `${ARABIC_EDITION}: ${i + 1}:1 ${isFatiha ? 'lost' : 'still carries'} the basmala`
  );
});
check(/بِسْمِ/.test(arabic[26][29]), `${ARABIC_EDITION}: 27:30 lost its basmala`);

const written = [];
written.push(['surahs.json', await write('surahs.json', `${JSON.stringify(meta, null, 1)}\n`)]);
written.push(['quran.json', await write('quran.json', formatMatrix(arabic))]);

for (const edition of TRANSLATIONS) {
  // Translations carry no basmala of their own - verified against all five editions.
  const texts = toTextMatrix(await fetchEdition(edition), { stripBasmala: false });
  checkShape(edition, texts, meta);
  written.push([
    `translations/${edition}.json`,
    await write(`translations/${edition}.json`, formatMatrix(texts)),
  ]);
}

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed:`);
  for (const message of failures.slice(0, 20)) console.error(`  - ${message}`);
  if (failures.length > 20) console.error(`  ... and ${failures.length - 20} more`);
  process.exit(1);
}

console.log('');
let total = 0;
for (const [name, bytes] of written) {
  total += bytes;
  console.log(`  ${name.padEnd(34)} ${kb(bytes).padStart(9)}`);
}
console.log(`  ${''.padEnd(34)} ${kb(total).padStart(9)}  total`);
console.log('\nAll checks passed.');
