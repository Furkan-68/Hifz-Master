/**
 * Downloads the page layout of the Madinah Mushaf into public/data/, where the Mushaf view
 * reads it from.
 *
 *   npm run fetch:mushaf
 *
 * Run by hand, never as part of the build - a build must not depend on the network. This is
 * 605 requests and takes a couple of minutes, so it is not something to repeat casually.
 *
 * The print reproduced here is the 1441 H edition, the one the Complex prints today. Its line
 * breaks differ from the 1421 H edition on 355 of the 604 pages; what does *not* differ is
 * which verses a page holds, on any page.
 *
 * What comes back is not Arabic. The QCF fonts address one glyph per word through their own
 * codes, so a code here means "this word as this font draws it" and nothing at all in another.
 * Text and font are inseparable; see public/data/README.md.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Pinned to a commit rather than a branch, so the bytes cannot change under us. The JSON in
// this repository is MIT; the fonts it also carries are not, and are only ever linked, never
// copied here - see services/mushaf.ts.
const SOURCE = 'https://raw.githubusercontent.com/MohamadHajjRabee/quran-qcf4/a51076ceb85855d64239d1a2e0decfd306ad5ecc';
const PAGES = 604;
const TOTAL_AYAHS = 6236;
const CONCURRENCY = 8; // polite to a free host, and still done in about a minute

// What one full pass has to come to. These are not guesses; they are what the source holds,
// and they are here so that a truncated or shifted download fails loudly.
const EXPECTED = { words: 77448, ends: 6236, quarters: 199, headers: 114, bismillahs: 112 };

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data');
const OUT_FILE = join(DATA_DIR, 'mushaf-v4.json');
const OLD_FILE = join(DATA_DIR, 'mushaf-v2.json');

// --- global ayah numbers ------------------------------------------------------------------

// The source speaks "2:255"; everything in the app speaks 1-6236. surahs.json already carries
// the verse counts that convert between them, so this needs no second source.
const buildOffsets = async () => {
  const surahs = JSON.parse(await readFile(join(DATA_DIR, 'surahs.json'), 'utf8'));
  const offsets = [];
  let running = 0;
  for (const surah of surahs) {
    offsets.push(running);
    running += surah.numberOfAyahs;
  }
  if (running !== TOTAL_AYAHS) throw new Error(`surahs.json sums to ${running} ayahs, expected ${TOTAL_AYAHS}`);
  return offsets;
};

// --- fetching ---------------------------------------------------------------------------

const getJson = async (path) => {
  // A free host on 605 requests will drop one now and then; that is not a reason to start over.
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(`${SOURCE}/${path}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (err) {
      if (attempt === 4) throw new Error(`${path}: ${err.message}`);
      await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }
};

const getPage = (page) => getJson(`pages/${String(page).padStart(3, '0')}.json`);

// --- shaping ------------------------------------------------------------------------------

const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};

const tally = { words: 0, ends: 0, quarters: 0, headers: 0, bismillahs: 0 };

/**
 * One page of the source -> its printed lines.
 *
 * A *run* is the consecutive words of one ayah within one line. It becomes exactly one span in
 * the DOM, which is what makes a range selectable by word without a span per word: a run never
 * mixes two ayahs, and never crosses a line break.
 *
 * The ornamental lines are lines like any other here, carrying the glyph the print sets: the
 * band naming the surah, and the basmala below it. The renderer no longer has to guess which
 * blank line holds what.
 */
const toLines = (page, sheet, offsets) => {
  const lines = [];

  for (const line of sheet.lines) {
    const words = line.words ?? [];

    const header = words.find((word) => word.type === 'surah_header');
    if (header) {
      tally.headers++;
      check(words.length === 1, `page ${page}: line ${line.line} mixes a surah band with ${words.length - 1} more`);
      lines.push({ type: 'surah', sura: header.sura, glyph: String.fromCodePoint(header.code) });
      continue;
    }

    const bismillah = words.find((word) => word.type === 'bismillah');
    if (bismillah) {
      tally.bismillahs++;
      check(words.length === 1, `page ${page}: line ${line.line} mixes a basmala with ${words.length - 1} more`);
      lines.push({ type: 'bismillah', glyph: String.fromCodePoint(bismillah.code) });
      continue;
    }

    if (!words.length) {
      lines.push({ type: 'blank' });
      continue;
    }

    const runs = [];
    // A quarter marker belongs to no ayah: it stands in the text where a rub' begins, which is
    // ahead of the word that opens it - and on 72 lines that is the first word of the line. So
    // it is held back and rides into the run of the word it precedes, which leaves the printed
    // order of the line exactly as it is and spares the renderer a third kind of thing to lay
    // out. It also means the selection is unaffected: the marker sits inside a span that
    // belongs to an ayah either way.
    let quarters = [];

    for (const word of words) {
      const glyph = String.fromCodePoint(word.code);
      check([...glyph].length === 1, `page ${page}: ${word.verse_key} draws ${[...glyph].length} glyphs in one code`);

      if (word.type === 'quarter') {
        tally.quarters++;
        quarters.push(glyph);
        continue;
      }

      if (word.type === 'end') tally.ends++;
      else tally.words++;

      const [surahNumber, numberInSurah] = word.verse_key.split(':').map(Number);
      const ayah = offsets[surahNumber - 1] + numberInSurah;
      check(ayah >= 1 && ayah <= TOTAL_AYAHS, `page ${page}: verse_key ${word.verse_key} maps to ${ayah}`);

      const last = runs[runs.length - 1];
      // Same ayah as the previous word on this line? Then it belongs in the same run.
      if (last && last[0] === ayah) last[1].push(...quarters, glyph);
      else runs.push([ayah, [...quarters, glyph]]);
      quarters = [];
    }

    // Nothing followed it on this line, so it goes in behind instead - the order still holds.
    if (quarters.length) {
      check(runs.length > 0, `page ${page}: line ${line.line} holds a quarter marker and nothing else`);
      if (runs.length) runs[runs.length - 1][1].push(...quarters);
    }

    lines.push({ type: 'ayah', runs: runs.map(([ayah, glyphs]) => [ayah, glyphs.join(' ')]) });
  }

  return lines;
};

// --- main ------------------------------------------------------------------------------

const offsets = await buildOffsets();
const surahStarts = new Set(offsets.map((offset) => offset + 1));

console.log(`Downloading ${PAGES} pages from ${SOURCE.split('/').slice(3, 5).join('/')}`);

// Page -> the font that draws it. 47 files for 604 pages, so one file covers six to fifteen
// consecutive pages; the app turns that into one request per stretch rather than per page.
const fontMap = await getJson('font-map.json');
const pageFont = [];

const pages = [];
for (let start = 0; start < PAGES; start += CONCURRENCY) {
  const batch = [];
  for (let page = start + 1; page <= Math.min(start + CONCURRENCY, PAGES); page++) {
    batch.push(getPage(page).then((sheet) => [page, sheet]));
  }
  for (const [page, sheet] of (await Promise.all(batch)).sort((a, b) => a[0] - b[0])) {
    check(sheet.page === page, `page ${page}: the file says it is page ${sheet.page}`);

    const family = fontMap[String(page)];
    const match = /^QCF4_Hafs_(\d{2})$/.exec(family ?? '');
    check(!!match, `page ${page}: font-map says ${family}, which is not a QCF4_Hafs family`);
    check(sheet.font === family, `page ${page}: the file is set in ${sheet.font}, font-map says ${family}`);
    pageFont[page - 1] = match ? Number(match[1]) : 0;

    pages[page - 1] = toLines(page, sheet, offsets);
  }
  process.stdout.write(`\r  ${Math.min(start + CONCURRENCY, PAGES)}/${PAGES} pages`);
}
console.log('');

// --- checks ------------------------------------------------------------------------------

const ayahsSeen = new Set();
const openings = new Set();

pages.forEach((lines, i) => {
  check(lines.length >= 5 && lines.length <= 15, `page ${i + 1}: ${lines.length} lines`);
  check(lines.some((line) => line.type === 'ayah'), `page ${i + 1}: no verses at all`);
  for (const line of lines) {
    if (line.type !== 'ayah') continue;
    for (const [ayah] of line.runs) ayahsSeen.add(ayah);
    if (surahStarts.has(line.runs[0][0])) openings.add(line.runs[0][0]);
  }
});

check(ayahsSeen.size === TOTAL_AYAHS, `${ayahsSeen.size} distinct ayahs across the pages, expected ${TOTAL_AYAHS}`);
check(openings.size === 114, `${openings.size} surahs open a line of their own, expected 114`);
for (const [what, expected] of Object.entries(EXPECTED)) {
  check(tally[what] === expected, `${tally[what]} ${what}, expected ${expected}`);
}
// Al-Fatiha counts its basmala as verse 1, and At-Tawba has none - so two bands fewer.
check(
  tally.headers - tally.bismillahs === 2,
  `${tally.headers} bands against ${tally.bismillahs} basmalas, expected a difference of 2`
);

// The one thing that must not have moved. Which verses a page holds is what a stored review
// unit of kind `page` means, so if any page here covered a different stretch than the edition
// this replaces, every such unit would silently change what it stands for. It does not - but
// that is a claim worth checking rather than repeating.
const range = (lines) => {
  let start = Infinity;
  let end = -Infinity;
  for (const line of lines) {
    if (line.type !== 'ayah') continue;
    for (const [ayah] of line.runs) {
      if (ayah < start) start = ayah;
      if (ayah > end) end = ayah;
    }
  }
  return `${start}-${end}`;
};
try {
  const previous = JSON.parse(await readFile(OLD_FILE, 'utf8'));
  let moved = 0;
  previous.forEach((lines, i) => {
    if (range(lines) !== range(pages[i])) moved++;
  });
  check(moved === 0, `${moved} pages hold a different stretch of verses than the previous edition`);
  console.log(`  checked all ${previous.length} pages against ${OLD_FILE.split(/[\\/]/).pop()}: same verses per page`);
} catch (err) {
  if (err.code !== 'ENOENT') throw err;
  console.log('  (no previous edition on disk to check the page boundaries against)');
}

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed:`);
  for (const message of failures.slice(0, 20)) console.error(`  - ${message}`);
  if (failures.length > 20) console.error(`  ... and ${failures.length - 20} more`);
  process.exit(1);
}

// One line per printed line: 9000 of them, and still a readable diff when this is re-run.
const body = pages
  .map((lines) => `[\n${lines.map((line) => ` ${JSON.stringify(line)}`).join(',\n')}\n]`)
  .join(',\n');
const out = `{\n"pageFont": ${JSON.stringify(pageFont)},\n"pages": [\n${body}\n]\n}\n`;
await mkdir(DATA_DIR, { recursive: true });
await writeFile(OUT_FILE, out);

const glyphs = tally.words + tally.ends + tally.quarters;
console.log(`\n  mushaf-v4.json  ${(Buffer.byteLength(out) / 1024).toFixed(0)} KB  ${glyphs.toLocaleString('en')} glyphs`);
console.log('\nAll checks passed.');
