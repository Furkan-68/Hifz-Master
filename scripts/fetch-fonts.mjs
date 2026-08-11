/**
 * Downloads every font the app sets text in into public/fonts/, so that nothing but the
 * recitation audio comes off the network.
 *
 *   npm run fetch:fonts
 *
 * Run by hand, never as part of the build - a build must not depend on the network. This is
 * about 38 MB over 113 requests and takes a few minutes.
 *
 * Two sets, kept apart because they are unlike in every way that matters:
 *
 * - public/fonts/qcf4/ - the 48 QCF V4 faces the Mushaf page view draws its glyphs with, from
 *   the same pinned commit the layout comes from. 36 MB, and inseparable from that layout:
 *   see public/data/README.md and public/fonts/README.md.
 * - public/fonts/google/ - the five faces the rest of the app is set in, mirrored from the
 *   Google Fonts API together with a rewritten google.css that points at the local copies.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The same commit scripts/fetch-mushaf.mjs pins the layout to. The two have to agree: a QCF
// font addresses one glyph per word through its own codes, so a face from another revision
// would draw a different word for the same code rather than fail.
const QCF4_SOURCE = 'https://cdn.jsdelivr.net/gh/MohamadHajjRabee/quran-qcf4@a51076ceb85855d64239d1a2e0decfd306ad5ecc/fonts-woff2';

// Verbatim the stylesheet index.html used to link. Anything the app can be set in has to be in
// here, or switching to that face offline falls back to a system serif.
const GOOGLE_CSS = 'https://fonts.googleapis.com/css2?family=Amiri:ital,wght@0,400;0,700;1,400;1,700&family=Amiri+Quran&family=Inter:wght@300;400;500;600;700&family=Noto+Naskh+Arabic:wght@400;700&family=Scheherazade+New:wght@400;700&display=swap';

// Asked without one, the API serves TrueType for the sake of browsers from 2010. woff2 is a
// third of the size and every browser this app runs in reads it.
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const PAGES = 604;
const HAFS_FACES = 47; // one face covers 6-15 consecutive pages
const BAND_FAMILY = 'QCF4_QBSML'; // the band naming a surah, one font for the whole Mushaf
const CONCURRENCY = 8; // polite to a free host, and still done in a few minutes

// Every family the settings panel can switch to, plus the one the interface is set in. The
// four Arabic ones must each bring an arabic subset; that is the whole point of them.
const FAMILIES = ['Amiri', 'Amiri Quran', 'Inter', 'Noto Naskh Arabic', 'Scheherazade New'];
const ARABIC_FAMILIES = FAMILIES.filter((family) => family !== 'Inter');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = join(ROOT, 'public', 'data');
const FONT_DIR = join(ROOT, 'public', 'fonts');
const QCF4_DIR = join(FONT_DIR, 'qcf4');
const GOOGLE_DIR = join(FONT_DIR, 'google');

const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};

/** Stops before downloading tens of megabytes on a premise that has already turned out false. */
const report = () => {
  if (!failures.length) return;
  console.error(`\n${failures.length} check(s) failed:`);
  for (const message of failures.slice(0, 20)) console.error(`  - ${message}`);
  if (failures.length > 20) console.error(`  ... and ${failures.length - 20} more`);
  process.exit(1);
};

const kb = (bytes) => `${(bytes / 1024).toFixed(0)} KB`;

// --- fetching -----------------------------------------------------------------------------

const get = async (url, headers = {}) => {
  // A free host on a hundred requests will drop one now and then; not a reason to start over.
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, { headers });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response;
    } catch (err) {
      if (attempt === 4) throw new Error(`${url}: ${err.message}`);
      await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }
};

const getBytes = async (url) => Buffer.from(await (await get(url)).arrayBuffer());

/** Runs the downloads in batches, counting them off in place as they land. */
const inBatches = async (items, work) => {
  const results = [];
  let done = 0;
  for (let start = 0; start < items.length; start += CONCURRENCY) {
    const batch = items.slice(start, start + CONCURRENCY);
    results.push(
      ...(await Promise.all(
        batch.map(async (item) => {
          const value = await work(item);
          process.stdout.write(`\r  ${++done}/${items.length} files`);
          return value;
        })
      ))
    );
  }
  console.log('');
  return results;
};

/** woff2 begins with these four bytes. An error page dressed as a font does not. */
const isWoff2 = (bytes) => bytes.subarray(0, 4).toString('latin1') === 'wOF2';

// --- the Mushaf faces ----------------------------------------------------------------------

// Which faces to fetch is not a constant here: it is read back out of the layout that will be
// asking for them, so the two cannot drift apart unnoticed.
const layout = JSON.parse(await readFile(join(DATA_DIR, 'mushaf-v4.json'), 'utf8'));
const faces = [...new Set(layout.pageFont)].sort((a, b) => a - b);

check(layout.pageFont.length === PAGES, `the layout covers ${layout.pageFont.length} pages, expected ${PAGES}`);
check(
  faces.length === HAFS_FACES && faces.every((face, i) => face === i + 1),
  `the layout names faces ${faces.join(',')}, expected 1 to ${HAFS_FACES} with no gaps`
);
report();

// Same rule services/mushaf.ts sets a page in: the face zero-padded to two digits, and the _W
// suffix on the file that the family name does not carry. The band is the one without it.
const qcf4Files = [
  `${BAND_FAMILY}.woff2`,
  ...faces.map((face) => `QCF4_Hafs_${String(face).padStart(2, '0')}_W.woff2`),
];

console.log(`Downloading ${qcf4Files.length} Mushaf faces from ${new URL(QCF4_SOURCE).host}`);
await mkdir(QCF4_DIR, { recursive: true });
const qcf4Sizes = await inBatches(qcf4Files, async (name) => {
  const bytes = await getBytes(`${QCF4_SOURCE}/${name}`);
  check(isWoff2(bytes), `${name}: not a woff2 file`);
  // The smallest of the 48 is 360 KB. Anything near zero is a truncated body, not a font.
  check(bytes.length > 100 * 1024, `${name}: only ${kb(bytes.length)}`);
  await writeFile(join(QCF4_DIR, name), bytes);
  return bytes.length;
});

// --- the interface faces -------------------------------------------------------------------

console.log(`\nDownloading the interface faces from ${new URL(GOOGLE_CSS).host}`);
const css = await (await get(GOOGLE_CSS, { 'User-Agent': BROWSER_UA })).text();

// The API answers with one commented @font-face per family, weight, style and unicode subset.
const blocks = [...css.matchAll(/\/\*\s*([^*]+?)\s*\*\/\s*@font-face\s*\{([^}]*)\}/g)].map(
  ([, subset, body]) => {
    const field = (name) => (body.match(new RegExp(`${name}:\\s*([^;]+);`)) ?? [])[1]?.trim();
    return {
      subset,
      family: field('font-family')?.replace(/['"]/g, ''),
      style: field('font-style'),
      weight: field('font-weight'),
      url: (body.match(/url\((\S+?)\)/) ?? [])[1],
    };
  }
);

check(blocks.length > 0, 'the stylesheet held no @font-face rules at all');
for (const family of FAMILIES) {
  check(
    blocks.some((block) => block.family === family),
    `no @font-face for ${family}`
  );
}
for (const family of ARABIC_FAMILIES) {
  check(
    blocks.some((block) => block.family === family && block.subset === 'arabic'),
    `${family} came without an arabic subset`
  );
}
for (const block of blocks) {
  check(block.url?.endsWith('.woff2'), `${block.family} ${block.style} ${block.weight} ${block.subset}: not a woff2 url`);
}
report();

// Named for the face rather than kept under the hash Google serves it as, so re-running this
// produces a diff a person can read.
const slug = (text) => text.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
const names = new Map();
for (const block of blocks) {
  const name = `${slug(block.family)}-${block.style}-${block.weight}-${slug(block.subset)}.woff2`;
  check(!names.has(name), `two faces would be written to ${name}`);
  names.set(name, block.url);
}
report();

await mkdir(GOOGLE_DIR, { recursive: true });
const googleSizes = await inBatches([...names], async ([name, url]) => {
  const bytes = await getBytes(url);
  check(isWoff2(bytes), `${name}: not a woff2 file`);
  await writeFile(join(GOOGLE_DIR, name), bytes);
  return bytes.length;
});

// The stylesheet as served, with only the addresses changed. Relative, so it stays right under
// any deploy base - and it sits in public/, which Vite copies without touching the paths.
const byUrl = new Map([...names].map(([name, url]) => [url, name]));
const localCss = css.replace(/url\((\S+?)\)/g, (whole, url) => {
  const name = byUrl.get(url);
  check(name !== undefined, `no local copy for ${url}`);
  return name ? `url(./google/${name})` : whole;
});
check(!localCss.includes('fonts.gstatic.com'), 'the rewritten stylesheet still points at fonts.gstatic.com');

const header = `/* Generated by scripts/fetch-fonts.mjs - do not edit.\n   The Google Fonts stylesheet, mirrored, pointing at the copies in ./google/. */\n`;
report();
await writeFile(join(FONT_DIR, 'google.css'), header + localCss);

// --- what landed ----------------------------------------------------------------------------

const total = (sizes) => sizes.reduce((sum, size) => sum + size, 0);
const mb = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`;

console.log('');
console.log(`  ${'public/fonts/qcf4/'.padEnd(34)} ${String(qcf4Files.length).padStart(3)} files  ${mb(total(qcf4Sizes)).padStart(9)}`);
console.log(`  ${'public/fonts/google/'.padEnd(34)} ${String(names.size).padStart(3)} files  ${mb(total(googleSizes)).padStart(9)}`);
console.log(`  ${'public/fonts/google.css'.padEnd(34)} ${''.padStart(9)}  ${kb(Buffer.byteLength(header + localCss)).padStart(9)}`);
console.log('\nAll checks passed.');
