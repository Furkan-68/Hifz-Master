/**
 * Downloads a whole recitation into public/audio/<reciter>/, so that playback stops needing
 * the network - the last thing in this app that still did.
 *
 *   npm run fetch:audio                  # Alafasy, the default reciter
 *   npm run fetch:audio -- ar.husary     # any other edition id from RECITERS in App.tsx
 *   npm run fetch:audio -- --force       # re-download files that are already here
 *
 * HIFZ_AUDIO_DIR=/var/lib/hifz-audio npm run fetch:audio   # write outside the repository
 *
 * Run by hand, never as part of the build - a build must not depend on the network. This is
 * one MP3 per verse, 6236 of them, about 1.6 GB per reciter, and it takes a quarter of an hour.
 *
 * Resumable on purpose: a file is written under a .part name and moved into place only once
 * it is complete and has been checked, so anything already sitting in the directory is whole
 * and gets skipped. Interrupt it and run it again.
 *
 * The app finds what landed through public/audio/manifest.json, which is written only for a
 * reciter whose 6236 files are all present - see getAyahAudioUrl in services/quranApi.ts.
 */
import { mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// The same address services/quranApi.ts falls back to, and the same 128 kbps: the bitrate is
// part of the path, and it is what the sizes and the checks below assume.
const CDN = 'https://cdn.islamic.network/quran/audio';
const BITRATE = 128;

const TOTAL_AYAHS = 6236;
const CONCURRENCY = 8; // polite to a free host that is about to serve 6236 files
const MIN_BYTES = 8 * 1024; // the shortest verse is ~25 KB; anything under this is not audio

const DEFAULT_RECITER = 'ar.alafasy';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// public/audio by default, which is where the dev server and a build serve it from. A server
// deployment points HIFZ_AUDIO_DIR somewhere outside the repository instead and maps /audio/
// onto it in its own config - otherwise `npm run build` copies all 1.6 GB into dist/ and the
// recitation sits on the disk twice. Wherever it goes, the layout is the same, so the app
// cannot tell the difference.
const AUDIO_DIR = process.env.HIFZ_AUDIO_DIR
  ? resolve(process.env.HIFZ_AUDIO_DIR)
  : join(ROOT, 'public', 'audio');
const MANIFEST = join(AUDIO_DIR, 'manifest.json');

const args = process.argv.slice(2);
const force = args.includes('--force');
const reciters = args.filter((arg) => !arg.startsWith('-'));
if (!reciters.length) reciters.push(DEFAULT_RECITER);

const mb = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`;

// --- fetching -----------------------------------------------------------------------------

// A verse is 100-350 KB and normally arrives in well under a second. Anything still open after
// fifteen is a connection that has stopped moving, and this host does leave a few hanging over a
// run this long: without a deadline the whole batch waits on the slowest socket, and the 6-per-
// second start decays to about one. Dropping it and asking again is far quicker than waiting.
const TIMEOUT = 15_000;
const ATTEMPTS = 6;

/**
 * The body, with the length the server announced for it. Reading the body is part of what is
 * retried on purpose - a connection that dies halfway through 140 KB is the failure to expect
 * here, and it would otherwise land outside the loop as a permanent one.
 */
const getBytes = async (url) => {
  // Over 6236 requests a free host will drop a few; that is not a reason to start over. The
  // timeout matters as much as the retry: without it one connection that is never answered
  // and never refused stalls a batch, and with it the run only stalls for 30 seconds.
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return {
        bytes: Buffer.from(await response.arrayBuffer()),
        declared: Number(response.headers.get('content-length')),
      };
    } catch (err) {
      if (attempt === ATTEMPTS) throw new Error(err.message);
      await new Promise((resolve) => setTimeout(resolve, attempt * 750));
    }
  }
};

/**
 * These files carry no ID3 tag - they open straight on an MPEG frame sync. An error page
 * dressed as audio does not, and neither does a body that stopped halfway.
 */
const looksLikeMp3 = (bytes) =>
  bytes.length >= MIN_BYTES &&
  ((bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) ||
    bytes.subarray(0, 3).toString('latin1') === 'ID3');

/** Bytes already on disk, or 0 when that verse has not been fetched yet. */
const sizeOnDisk = async (path) => {
  try {
    return (await stat(path)).size;
  } catch {
    return 0;
  }
};

const fetchAyah = async (reciter, number) => {
  const path = join(AUDIO_DIR, reciter, `${number}.mp3`);

  if (!force) {
    // Nothing lands under its final name before it has passed the checks below, so a file
    // that is here at all is a file that is done.
    const size = await sizeOnDisk(path);
    if (size >= MIN_BYTES) return { bytes: size, skipped: true };
  }

  const { bytes, declared } = await getBytes(`${CDN}/${BITRATE}/${reciter}/${number}.mp3`);

  if (!looksLikeMp3(bytes)) throw new Error(`${bytes.length} bytes, and not an MP3`);
  if (declared && declared !== bytes.length) {
    throw new Error(`got ${bytes.length} bytes of the ${declared} announced`);
  }

  // Written aside and moved into place, which is what makes an interrupted run resumable
  // rather than a directory of half-files.
  const part = `${path}.part`;
  await writeFile(part, bytes);
  await rename(part, path);
  return { bytes: bytes.length, skipped: false };
};

/** Runs the downloads in batches, counting them off in place as they land. */
const download = async (reciter) => {
  await mkdir(join(AUDIO_DIR, reciter), { recursive: true });

  const numbers = Array.from({ length: TOTAL_AYAHS }, (_, i) => i + 1);
  const failures = [];
  let done = 0;
  let fetched = 0;
  let skipped = 0;
  let bytes = 0;

  for (let start = 0; start < numbers.length; start += CONCURRENCY) {
    const batch = numbers.slice(start, start + CONCURRENCY);
    await Promise.all(
      batch.map(async (number) => {
        try {
          const result = await fetchAyah(reciter, number);
          bytes += result.bytes;
          if (result.skipped) skipped++;
          else fetched++;
        } catch (err) {
          failures.push(`${number}.mp3: ${err.message}`);
          // A .part left behind by a failed write would otherwise sit there forever.
          await unlink(join(AUDIO_DIR, reciter, `${number}.mp3.part`)).catch(() => {});
        }
        done++;
        process.stdout.write(
          `\r  ${String(done).padStart(4)}/${TOTAL_AYAHS} verses  ${mb(bytes).padStart(9)}` +
            `  (${fetched} fetched, ${skipped} already here)   `
        );
      })
    );
  }
  console.log('');
  return { failures, fetched, skipped, bytes };
};

// --- the manifest ---------------------------------------------------------------------------

/**
 * What the app reads to decide whether it may play a reciter off disk. Entries accumulate:
 * fetching a second reciter must not un-bundle the first.
 */
const writeManifest = async (reciter, bytes) => {
  let manifest = { reciters: {} };
  try {
    const existing = JSON.parse(await readFile(MANIFEST, 'utf8'));
    if (existing?.reciters) manifest = existing;
  } catch {
    // No manifest yet, or one that will not parse - either way this run writes a fresh one.
  }

  manifest.reciters[reciter] = {
    files: TOTAL_AYAHS,
    bitrate: BITRATE,
    bytes,
    source: `${CDN}/${BITRATE}/${reciter}`,
    fetchedAt: new Date().toISOString().slice(0, 10),
  };

  const ordered = Object.fromEntries(Object.entries(manifest.reciters).sort());
  await writeFile(MANIFEST, `${JSON.stringify({ reciters: ordered }, null, 2)}\n`);
};

// --- run --------------------------------------------------------------------------------------

let incomplete = false;

for (const reciter of reciters) {
  console.log(
    `\nDownloading ${reciter} - ${TOTAL_AYAHS} verses at ${BITRATE} kbps from ${new URL(CDN).host}`
  );
  const { failures, fetched, skipped, bytes } = await download(reciter);

  if (failures.length) {
    incomplete = true;
    console.error(`\n  ${failures.length} verse(s) did not come down:`);
    for (const message of failures.slice(0, 20)) console.error(`    - ${message}`);
    if (failures.length > 20) console.error(`    ... and ${failures.length - 20} more`);
    console.error(`\n  ${reciter} stays out of the manifest. Run this again to fill the gaps.`);
    continue;
  }

  await writeManifest(reciter, bytes);
  // The directory as it actually is, not as it is by default - HIFZ_AUDIO_DIR may have moved it.
  console.log(`  ${fetched} fetched, ${skipped} already here, ${mb(bytes)} in ${join(AUDIO_DIR, reciter)}`);
  console.log(`  manifest.json now lists ${reciter} - the app will play it off disk.`);
}

if (incomplete) process.exit(1);
console.log('\nAll checks passed.');
