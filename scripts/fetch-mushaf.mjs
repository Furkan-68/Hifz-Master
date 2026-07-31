/**
 * Downloads the page layout of the Madinah Mushaf into public/data/, where the Mushaf view
 * reads it from.
 *
 *   npm run fetch:mushaf
 *
 * Run by hand, never as part of the build - a build must not depend on the network. This is
 * 604 requests and takes a couple of minutes, so it is not something to repeat casually.
 *
 * What comes back is not Arabic. The QCF page fonts address one glyph per word through their
 * own codes, so `ﱁ` here means "the first word of page 1 as that page's font draws it" and
 * nothing at all in any other font. Text and font are inseparable; see public/data/README.md.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const API = 'https://api.quran.com/api/v4/verses/by_page';
const PAGES = 604;
const TOTAL_AYAHS = 6236;
const CONCURRENCY = 8; // polite to a free API, and still done in about a minute

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data');
const OUT_FILE = join(DATA_DIR, 'mushaf-v2.json');

// --- global ayah numbers ------------------------------------------------------------------

// The API speaks "2:255"; everything in the app speaks 1-6236. surahs.json already carries the
// verse counts that convert between them, so this needs no second source.
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

const getPage = async (page) => {
  // page_number per word is not redundant: `by_page/N` answers with the verses that *begin* on
  // page N, and a verse straddling the page break brings its words on N+1 along - numbered from
  // line 1 of that next page. Without this field those words would land on the wrong page, and
  // the line they really belong to would stay empty.
  const url = `${API}/${page}?words=true&word_fields=code_v2,line_number,page_number&per_page=300`;
  // A free API on 604 requests will drop one now and then; that is not a reason to start over.
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      if (!Array.isArray(payload?.verses)) throw new Error('response carries no verses');
      return payload.verses;
    } catch (err) {
      if (attempt === 4) throw new Error(`page ${page}: ${err.message}`);
      await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }
};

// --- shaping ------------------------------------------------------------------------------

const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};

/**
 * Files every word of one response under the page and line it actually prints on.
 *
 * A *run* is the consecutive words of one ayah within one line. It becomes exactly one span in
 * the DOM, which is what makes a range selectable by word without a span per word: a run never
 * mixes two ayahs, and never crosses a line break.
 */
const collect = (verses, offsets, sheets, page) => {
  let wordCount = 0;

  for (const verse of verses) {
    const [surahNumber, numberInSurah] = verse.verse_key.split(':').map(Number);
    const ayah = offsets[surahNumber - 1] + numberInSurah;
    check(
      ayah >= 1 && ayah <= TOTAL_AYAHS,
      `page ${page}: verse_key ${verse.verse_key} maps to ${ayah}`
    );

    for (const word of verse.words) {
      const glyph = word.code_v2;
      check(typeof glyph === 'string' && glyph.length > 0, `page ${page}: ${verse.verse_key} has an empty glyph`);
      check(Number.isInteger(word.line_number) && word.line_number >= 1, `page ${page}: ${verse.verse_key} has line ${word.line_number}`);
      check(Number.isInteger(word.page_number) && word.page_number >= 1, `page ${page}: ${verse.verse_key} has page ${word.page_number}`);
      wordCount++;

      const sheet = (sheets[word.page_number] ??= new Map());
      if (!sheet.has(word.line_number)) sheet.set(word.line_number, []);
      const runs = sheet.get(word.line_number);
      const last = runs[runs.length - 1];
      // Same ayah as the previous word on this line? Then it belongs in the same run.
      if (last && last[0] === ayah) last[1].push(glyph);
      else runs.push([ayah, [glyph]]);
    }
  }
  return wordCount;
};

/**
 * One page's line map -> its lines. Lines without words are the ornamental ones that introduce
 * a surah: its name in a band, and below it the basmala. Which is which is left to the renderer,
 * because it can tell from the following line - the first run of a surah's opening line is that
 * surah's verse 1 - and because the printed gap is not always two lines.
 */
const toLines = (sheet) => {
  const lastLine = Math.max(...sheet.keys());
  const lines = [];
  let words = 0;
  for (let n = 1; n <= lastLine; n++) {
    const runs = sheet.get(n);
    if (!runs) {
      lines.push({ type: 'blank' });
      continue;
    }
    // Counted here, before the glyphs become a string: 198 words carry two glyphs with a space
    // between them in one code_v2, so the joined text cannot be counted back by splitting.
    for (const [, glyphs] of runs) words += glyphs.length;
    lines.push({ type: 'ayah', runs: runs.map(([ayah, glyphs]) => [ayah, glyphs.join(' ')]) });
  }
  return { lines, words };
};

// --- main ------------------------------------------------------------------------------

const offsets = await buildOffsets();
const surahStarts = new Set(offsets.map((offset) => offset + 1));

console.log(`Downloading ${PAGES} pages from ${API}`);

// Every word is filed by the page it prints on rather than by the response it arrived in, so
// a verse straddling a page break ends up split across the two pages it really occupies.
const sheets = {};
let totalWords = 0;
for (let start = 0; start < PAGES; start += CONCURRENCY) {
  const batch = [];
  for (let page = start + 1; page <= Math.min(start + CONCURRENCY, PAGES); page++) {
    batch.push(getPage(page).then((verses) => [page, verses]));
  }
  // Sorted, so the overflow from page N-1 lands on line 1 of page N ahead of that page's own
  // words. Promise.all preserves order within a batch; this keeps it across batches too.
  for (const [page, verses] of (await Promise.all(batch)).sort((a, b) => a[0] - b[0])) {
    totalWords += collect(verses, offsets, sheets, page);
  }
  process.stdout.write(`\r  ${Math.min(start + CONCURRENCY, PAGES)}/${PAGES} pages`);
}
console.log('');

const pages = [];
let keptWords = 0;
for (let page = 1; page <= PAGES; page++) {
  if (!sheets[page]) {
    check(false, `page ${page}: no words at all`);
    pages.push([]);
    continue;
  }
  const { lines, words } = toLines(sheets[page]);
  keptWords += words;
  pages.push(lines);
}

// --- checks ------------------------------------------------------------------------------

const ayahsSeen = new Set();
const openings = new Set();
let blankStretches = 0;

pages.forEach((lines, i) => {
  check(lines.length >= 5 && lines.length <= 15, `page ${i + 1}: ${lines.length} lines`);
  lines.forEach((line, n) => {
    if (line.type !== 'ayah') {
      if (n === 0 || lines[n - 1].type === 'ayah') blankStretches++;
      return;
    }
    for (const [ayah] of line.runs) ayahsSeen.add(ayah);
    // The renderer places the surah band by looking for a line that opens with a verse 1, so
    // every surah has to have such a line. That is what this collects.
    if (surahStarts.has(line.runs[0][0])) openings.add(line.runs[0][0]);
  });
});

check(keptWords === totalWords, `${keptWords} words written out of ${totalWords} received`);
check(ayahsSeen.size === TOTAL_AYAHS, `${ayahsSeen.size} distinct ayahs across the pages, expected ${TOTAL_AYAHS}`);
check(openings.size === 114, `${openings.size} surahs open a line of their own, expected 114`);
check(
  blankStretches === 114,
  `${blankStretches} stretches of blank lines, expected 114 - one introducing each surah`
);

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
await mkdir(DATA_DIR, { recursive: true });
await writeFile(OUT_FILE, `[\n${body}\n]\n`);

const bytes = Buffer.byteLength(`[\n${body}\n]\n`);
console.log(`\n  mushaf-v2.json  ${(bytes / 1024).toFixed(0)} KB  ${keptWords.toLocaleString('en')} words`);
console.log('\nAll checks passed.');
