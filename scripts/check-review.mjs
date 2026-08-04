/**
 * Checks the scheduling core in services/review.ts.
 *
 *   npm run check:review
 *
 * There is no test framework here and this does not introduce one - it follows the other
 * scripts in this directory: collect failures, print them, exit non-zero.
 *
 * It imports the TypeScript module directly; Node strips the types (v22.18+ does it without a
 * flag). That only works because services/review.ts touches neither the browser nor the two
 * other services, both of which read `import.meta.env` while they load. The ayah ranges it
 * needs are built here, out of the same JSON the app ships.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  HALTING,
  SOLID,
  FLUENT,
  MAX_REF,
  addUnit,
  adoptUnits,
  daysOverdue,
  dueUnits,
  emptyReview,
  evaluateGate,
  fullyLearnedPages,
  fullyLearnedSurahs,
  gradeCard,
  gradeUnit,
  isDue,
  disjointUnits,
  newCard,
  parseReview,
  previewGrades,
  proposeAdoption,
  removeUnit,
  serializeReview,
  suggestNextPage,
  unitKey,
} from '../services/review.ts';

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data');
const readJson = (file) => JSON.parse(readFileSync(join(DATA_DIR, file), 'utf8'));

const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};
const same = (a, b, message) => check(JSON.stringify(a) === JSON.stringify(b), `${message} - got ${JSON.stringify(a)}`);

// --- ranges, built the way App builds them ------------------------------------------------

const pages = readJson('mushaf-v2.json');
const surahs = readJson('surahs.json');

const pageRanges = pages.map((lines) => {
  let start = Infinity;
  let end = -Infinity;
  for (const line of lines) {
    if (line.type !== 'ayah') continue;
    for (const [ayah] of line.runs) {
      if (ayah < start) start = ayah;
      if (ayah > end) end = ayah;
    }
  }
  return end < start ? null : { start, end };
});

const surahRanges = [];
let running = 0;
for (const surah of surahs) {
  surahRanges.push({ start: running + 1, end: running + surah.numberOfAyahs });
  running += surah.numberOfAyahs;
}
const TOTAL_AYAHS = running;

const rangeOf = ({ kind, ref }) =>
  (kind === 'page' ? pageRanges[ref - 1] : surahRanges[ref - 1]) ?? null;
/** As it behaves before the Mushaf layout has arrived. */
const surahsOnly = (unit) => (unit.kind === 'surah' ? rangeOf(unit) : null);

const page = (ref) => ({ kind: 'page', ref });
const surah = (ref) => ({ kind: 'surah', ref });

const t0 = new Date('2026-03-10T09:00:00');
const at = (iso) => new Date(iso);

// --- 1. round trip through the stored form ------------------------------------------------
//
// The one that costs months in silence: a Date becomes an ISO string in localStorage. FSRS
// itself converts what it is handed, so `next()` survives it - but `isDue` compares
// startOfDay(card.due) and would be comparing a string.

{
  const graded = gradeCard(newCard(t0), t0, SOLID);
  const before = { version: 1, units: [{ ...page(587), card: graded, addedAt: t0.toISOString(), lastGrade: SOLID }] };
  const after = parseReview(serializeReview(before));

  check(after.units.length === 1, 'round trip lost the only unit');
  const unit = after.units[0];
  check(unit.card.due instanceof Date, 'due did not survive the round trip as a Date');
  check(unit.card.last_review instanceof Date, 'last_review did not survive the round trip as a Date');
  check(unit.kind === 'page' && unit.ref === 587, 'kind/ref did not survive the round trip');
  check(unit.lastGrade === SOLID, 'lastGrade did not survive the round trip');
  same(
    { s: unit.card.stability, d: unit.card.difficulty, r: unit.card.reps, sd: unit.card.scheduled_days },
    { s: graded.stability, d: graded.difficulty, r: graded.reps, sd: graded.scheduled_days },
    'the card numbers changed in the round trip'
  );
  check(unit.card.due.getTime() === graded.due.getTime(), 'due drifted in the round trip');

  const later = new Date(graded.due.getTime());
  check(
    isDue(unit.card, later) === isDue(graded, later),
    'isDue disagrees between the revived card and the original'
  );

  // And it keeps scheduling from there.
  const again = gradeCard(unit.card, later, SOLID);
  const straight = gradeCard(graded, later, SOLID);
  check(
    again.due.getTime() === straight.due.getTime() && again.stability === straight.stability,
    'scheduling from a revived card differs from scheduling from the original'
  );
}

// --- 2. the gate, over mixed unit kinds ----------------------------------------------------

{
  // A unit that is settled: graded Good, three ratings deep, not due yet.
  const settled = (unit, now) => {
    let card = newCard(now);
    let when = now;
    for (let i = 0; i < 3; i++) {
      card = gradeCard(card, when, SOLID);
      when = new Date(card.due.getTime());
    }
    return { ...unit, card, addedAt: now.toISOString(), lastGrade: SOLID };
  };
  // Rated the right way but only once - the day it was learned.
  const fresh = (unit, now, rating = SOLID) => ({
    ...unit,
    card: gradeCard(newCard(now), now, rating),
    addedAt: now.toISOString(),
    lastGrade: rating,
  });

  const now = t0;
  check(evaluateGate(emptyReview(), now).open, 'an empty rotation must be open');

  const neverReviewed = { ...page(14), card: newCard(now), addedAt: now.toISOString(), lastGrade: null };
  const g1 = evaluateGate({ version: 1, units: [neverReviewed] }, now);
  check(!g1.open && g1.blocked.kind === 'due', 'a brand new card is due today, so due must win');

  const g2 = evaluateGate({ version: 1, units: [fresh(surah(78), now)] }, now);
  check(!g2.open && g2.blocked.kind === 'unsettled', 'one surah with a single rating must be unsettled');
  same(g2.blocked.unit, surah(78), 'the unsettled verdict must name the surah');
  check(g2.blocked.reviews === 1, 'the unsettled verdict must report the rating count');

  const g3 = evaluateGate({ version: 1, units: [fresh(page(20), now, HALTING)] }, now);
  check(!g3.open && g3.blocked.kind === 'unsettled', 'one page rated Halting must keep the gate shut');
  check(g3.blocked.lastGrade === HALTING, 'the unsettled verdict must report the last grade');

  // Three settled units, nothing due -> open. Mixed kinds on purpose.
  const three = [settled(page(586), now), settled(surah(78), now), settled(page(587), now)];
  const openState = { version: 1, units: three };
  const g4 = evaluateGate(openState, now);
  check(g4.open, `three settled units and nothing due must open the gate - got ${JSON.stringify(g4.blocked)}`);

  // The assurance that closes the self-vouching hole: same grade, same day, reps below three.
  const sameDay = three.map((u) => ({ ...u, card: { ...u.card, reps: 2 } }));
  const g5 = evaluateGate({ version: 1, units: sameDay }, now);
  check(!g5.open && g5.blocked.kind === 'unsettled', 'reps below the threshold must keep the gate shut');
  check(g5.blocked.reviews === 2, 'the unsettled verdict must report reps, not the window size');

  // Only the last three count: an older unsettled unit does not hold the gate.
  const withOldFailure = { version: 1, units: [fresh(page(1), now, HALTING), ...three] };
  const staleFailure = {
    version: 1,
    units: withOldFailure.units.map((u, i) =>
      i === 0 ? { ...u, card: { ...u.card, due: new Date('2099-01-01T00:00:00') } } : u
    ),
  };
  check(evaluateGate(staleFailure, now).open, 'a unit outside the window must not hold the gate');

  // Due wins over unsettled even when both apply.
  const alsoDue = { version: 1, units: [...sameDay, { ...page(600), card: newCard(now), addedAt: '', lastGrade: null }] };
  const g6 = evaluateGate(alsoDue, now);
  check(g6.blocked.kind === 'due', 'due must be reported before unsettled');
  check(g6.blocked.units.length === 1, 'only the due units belong in the due verdict');
}

// --- 3. the day boundary -------------------------------------------------------------------

{
  const withDue = (iso) => ({ ...newCard(t0), due: at(iso) });
  check(isDue(withDue('2026-03-09T23:50:00'), at('2026-03-10T00:10:00')), 'yesterday 23:50 must be due after midnight');
  check(isDue(withDue('2026-03-10T23:50:00'), at('2026-03-10T08:00:00')), 'today 23:50 must be due at breakfast');
  check(!isDue(withDue('2026-03-11T00:01:00'), at('2026-03-10T23:59:00')), 'tomorrow 00:01 must not be due tonight');
  check(daysOverdue(withDue('2026-03-08T23:50:00'), at('2026-03-10T08:00:00')) === 2, 'daysOverdue must count whole days');
  check(daysOverdue(withDue('2026-03-10T23:50:00'), at('2026-03-10T08:00:00')) === 0, 'a unit due today is not overdue');
}

// --- 4. the parser -------------------------------------------------------------------------

{
  const card = gradeCard(newCard(t0), t0, SOLID);
  const good = { ...page(41), card, addedAt: t0.toISOString(), lastGrade: SOLID };

  for (const raw of [null, '', '{', '[]', '{"version":2,"units":[]}', '{"version":1}', 'null']) {
    const state = parseReview(raw);
    check(state.version === 1 && Array.isArray(state.units) && state.units.length === 0,
      `parseReview(${JSON.stringify(raw)}) must yield an empty usable state`);
  }

  const withJunk = (units) => parseReview(JSON.stringify({ version: 1, units }));

  check(withJunk([{ ...good, kind: 'juz' }]).units.length === 0, 'an unknown kind must be dropped');
  check(withJunk([{ ...good, ref: 0 }]).units.length === 0, 'ref 0 must be dropped');
  check(withJunk([{ ...good, ref: 605 }]).units.length === 0, 'page 605 must be dropped');
  check(withJunk([{ ...good, kind: 'surah', ref: 115 }]).units.length === 0, 'surah 115 must be dropped');
  check(withJunk([{ ...good, card: { ...card, due: 'not a date' } }]).units.length === 0, 'an unreadable due must be dropped');
  check(withJunk([{ ...good, card: { ...card, stability: null } }]).units.length === 0, 'a null stability must be dropped');
  check(withJunk([{ ...good, card: undefined }]).units.length === 0, 'a missing card must be dropped');

  same(withJunk([good, { ...good }]).units.map(unitKey), ['page:41'], 'a duplicate unitKey must collapse to one');
  same(
    withJunk([{ ...good, kind: 'page', ref: 1 }, { ...good, kind: 'surah', ref: 1 }]).units.map(unitKey),
    ['page:1', 'surah:1'],
    'page 1 and surah 1 are different units and must both survive'
  );

  // A broken entry must not take its neighbours with it.
  const mixed = withJunk([good, { ...good, ref: 9999 }, { ...good, kind: 'surah', ref: 78 }]);
  same(mixed.units.map(unitKey), ['page:41', 'surah:78'], 'a broken entry must not cost its neighbours');

  // The pre-`kind` shape.
  const legacy = withJunk([{ page: 41, card, addedAt: t0.toISOString(), lastGrade: SOLID }]);
  same(legacy.units.map(unitKey), ['page:41'], 'an entry with a bare `page` must be read as a page');

  // Order is the record and must be preserved verbatim.
  same(
    withJunk([{ ...good, ref: 3 }, { ...good, ref: 1 }, { ...good, ref: 2 }]).units.map((u) => u.ref),
    [3, 1, 2],
    'parseReview must not reorder - the array order is the learning order'
  );
}

// --- 5. ranges -----------------------------------------------------------------------------

{
  check(pageRanges.length === MAX_REF.page, `expected ${MAX_REF.page} pages, got ${pageRanges.length}`);
  check(surahRanges.length === MAX_REF.surah, `expected ${MAX_REF.surah} surahs, got ${surahRanges.length}`);
  check(TOTAL_AYAHS === 6236, `the surah counts add up to ${TOTAL_AYAHS}, expected 6236`);

  const partition = (ranges, label) => {
    let expected = 1;
    for (let i = 0; i < ranges.length; i++) {
      const range = ranges[i];
      check(!!range, `${label} ${i + 1} has no range`);
      if (!range) return;
      check(range.start === expected, `${label} ${i + 1} starts at ${range.start}, expected ${expected}`);
      check(range.end >= range.start, `${label} ${i + 1} ends before it starts`);
      expected = range.end + 1;
    }
    check(expected - 1 === 6236, `${label} ranges cover ${expected - 1} ayahs, expected 6236`);
  };
  partition(pageRanges, 'page');
  partition(surahRanges, 'surah');
}

// --- 6. largestUnits ------------------------------------------------------------------------

{
  const baqara = surahRanges[1];
  const baqaraPages = [];
  pageRanges.forEach((range, i) => {
    if (range.start >= baqara.start && range.end <= baqara.end) baqaraPages.push(page(i + 1));
  });
  check(baqaraPages.length > 40, `expected Al-Baqara to hold many whole pages, found ${baqaraPages.length}`);
  same(
    disjointUnits([surah(2), ...baqaraPages], rangeOf).map(unitKey),
    ['surah:2'],
    'a surah must swallow the pages inside it'
  );

  // Page 604 prints Al-Ikhlas, Al-Falaq and An-Nas whole.
  const shortSurahs = [];
  for (let n = 1; n <= MAX_REF.surah; n++) {
    const range = surahRanges[n - 1];
    if (range.start >= pageRanges[603].start && range.end <= pageRanges[603].end) shortSurahs.push(surah(n));
  }
  same(shortSurahs.map(unitKey), ['surah:112', 'surah:113', 'surah:114'], 'the whole surahs on page 604');
  same(
    disjointUnits([page(604), ...shortSurahs], rangeOf).map(unitKey),
    ['surah:112', 'surah:113', 'surah:114'],
    'named surahs must outrank the page that prints them'
  );

  // The case containment alone gets wrong: a page straddling two surahs is inside neither, so
  // only the overlap test drops it.
  const straddler = pageRanges.findIndex(
    (r, i) => i > 0 && surahRanges.some((s) => s.start > r.start && s.start <= r.end)
  );
  const around = surahRanges
    .map((s, i) => ({ s, ref: i + 1 }))
    .filter(({ s }) => s.end >= pageRanges[straddler].start && s.start <= pageRanges[straddler].end)
    .map(({ ref }) => surah(ref));
  check(around.length >= 2, 'expected a page straddling at least two surahs');
  check(
    !disjointUnits([...around, page(straddler + 1)], rangeOf).some((u) => u.kind === 'page'),
    'a page overlapping the surahs around it must be dropped'
  );

  // A page nothing else speaks for survives.
  same(
    disjointUnits([page(straddler + 1)], rangeOf).map(unitKey),
    [`page:${straddler + 1}`],
    'a page with no surah competing for it must be kept'
  );

  same(
    disjointUnits([page(1), surah(1)], rangeOf).map(unitKey),
    ['surah:1'],
    'on an identical range the surah must win'
  );
  same(
    disjointUnits([surah(1), surah(114)], rangeOf).map(unitKey),
    ['surah:1', 'surah:114'],
    'disjoint candidates must both survive, in Mushaf order'
  );
  same(disjointUnits([], rangeOf), [], 'no candidates, no units');
  same(
    disjointUnits([page(1), surah(1)], surahsOnly).map(unitKey),
    ['surah:1'],
    'without the layout only surahs can be judged'
  );
}

// --- 7. what is already marked learned ------------------------------------------------------

{
  // Every ayah of page 604, plus all but one of page 603.
  const learned = new Set();
  for (let a = pageRanges[603].start; a <= pageRanges[603].end; a++) learned.add(a);
  for (let a = pageRanges[602].start; a < pageRanges[602].end; a++) learned.add(a);
  const isLearned = (a) => learned.has(a);

  same(fullyLearnedPages(isLearned, rangeOf), [604], 'only page 604 is fully marked');

  const foundSurahs = fullyLearnedSurahs(isLearned, rangeOf);
  check(foundSurahs.includes(114) && foundSurahs.includes(113), 'the surahs inside page 604 are fully marked');
  check(!foundSurahs.includes(111), 'Al-Masad ends on the one unmarked ayah, so it is not complete');

  // Every complete surah is proposed by name; page 604 is dropped because the three surahs
  // printed on it already speak for every ayah it holds.
  same(
    proposeAdoption(isLearned, rangeOf).map(unitKey),
    ['surah:109', 'surah:110', 'surah:112', 'surah:113', 'surah:114'],
    'the proposal must be the non-overlapping units, in Mushaf order'
  );

  // Without the layout the same data yields the surahs instead - the migration still works.
  const withoutLayout = proposeAdoption(isLearned, surahsOnly);
  check(withoutLayout.length === foundSurahs.length, 'without the layout the proposal is the surahs');
  check(withoutLayout.every((u) => u.kind === 'surah'), 'without the layout no page may be proposed');

  same(fullyLearnedPages(() => false, rangeOf), [], 'nothing marked, nothing proposed');
  check(fullyLearnedSurahs(() => true, rangeOf).length === 114, 'everything marked proposes every surah');
  // Everything marked: exactly the 114 surahs, and not one of the 604 pages.
  const everything = proposeAdoption(() => true, rangeOf);
  check(everything.length === 114, `everything marked must yield 114 surahs, got ${everything.length}`);
  check(everything.every((u) => u.kind === 'surah'), 'with every surah complete no page may survive');
  let expected = 1;
  for (const unit of everything) {
    const range = rangeOf(unit);
    check(range.start === expected, `proposal ${unitKey(unit)} starts at ${range.start}, expected ${expected}`);
    expected = range.end + 1;
  }
  check(expected - 1 === 6236, `the proposals must cover all 6236 ayahs, reached ${expected - 1}`);
}

// --- 8. interval plausibility ---------------------------------------------------------------

{
  const first = gradeCard(newCard(t0), t0, SOLID);
  check(first.scheduled_days >= 1, `a fresh Good must schedule at least a day out, got ${first.scheduled_days}`);
  check(first.due.getTime() > t0.getTime(), 'a fresh Good must be due later than now');

  const halting = gradeCard(newCard(t0), t0, HALTING);
  check(halting.scheduled_days >= 1, `even Halting must schedule a whole day, got ${halting.scheduled_days}`);

  let card = newCard(t0);
  let when = t0;
  let longest = 0;
  for (let i = 0; i < 20; i++) {
    card = gradeCard(card, when, FLUENT);
    longest = Math.max(longest, card.scheduled_days);
    when = new Date(card.due.getTime());
  }
  // The cap is 30, but FSRS orders the three review intervals after clamping them - good is
  // forced above hard, easy above good - so a saturated Fluent lands two days over. Anything
  // beyond that would mean the cap is not being applied at all.
  check(longest <= 32, `intervals must respect the 30 day cap, saw ${longest}`);
  check(longest >= 30, `twenty Easy ratings should reach the cap, reached ${longest}`);

  const preview = previewGrades(newCard(t0), t0);
  check(preview[HALTING] >= 1 && preview[SOLID] >= 1 && preview[FLUENT] >= 1, 'every preview must be at least a day');
  check(preview[HALTING] <= preview[SOLID] && preview[SOLID] <= preview[FLUENT], 'the previews must be ordered');
}

// --- 9. suggestNextPage ----------------------------------------------------------------------

{
  const state = (units) => ({ version: 1, units: units.map((u) => ({ ...u, card: newCard(t0), addedAt: '', lastGrade: null })) });

  check(suggestNextPage(emptyReview(), 587) === 587, 'an empty rotation must return the fallback');
  check(suggestNextPage(state([surah(78), surah(79)]), 587) === 587, 'surahs alone give no direction');
  check(suggestNextPage(state([page(100)]), 1) === 101, 'one page suggests the next one');
  check(suggestNextPage(state([page(100), page(99)]), 1) === 98, 'two descending pages suggest going back');
  check(
    suggestNextPage(state([page(100), surah(8), page(101), page(99)]), 1) === 98,
    'surahs must be ignored and taken pages skipped'
  );
  check(suggestNextPage(state([page(604)]), 1) === 603, 'at the last page it must turn around');
  check(suggestNextPage(state([page(2), page(1)]), 1) === 3, 'at the first page it must turn around');
}

// --- 10. mutations ----------------------------------------------------------------------------

{
  let state = emptyReview();
  state = addUnit(state, page(587), t0);
  state = addUnit(state, surah(78), t0);
  state = addUnit(state, page(587), t0); // a duplicate must be a no-op
  same(state.units.map(unitKey), ['page:587', 'surah:78'], 'addUnit must append and refuse duplicates');

  const graded = gradeUnit(state, page(587), SOLID, t0);
  check(graded.units[0].lastGrade === SOLID, 'gradeUnit must record the rating');
  check(graded.units[0].card.reps === 1, 'gradeUnit must advance the card');
  check(graded.units[1].card.reps === 0, 'gradeUnit must leave the other units alone');
  same(graded.units.map(unitKey), ['page:587', 'surah:78'], 'gradeUnit must not reorder');

  same(
    removeUnit(graded, page(587)).units.map(unitKey),
    ['surah:78'],
    'removeUnit must drop exactly one unit'
  );

  const adopted = adoptUnits(emptyReview(), [surah(1), page(604)], t0);
  same(adopted.units.map(unitKey), ['surah:1', 'page:604'], 'adoptUnits must keep the order it is given');
  check(adopted.units.every((u) => u.lastGrade === null && u.card.reps === 0), 'adopted units start unreviewed');
  check(dueUnits(adopted, t0).length === 2, 'adopted units are due straight away');
}

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed:`);
  for (const message of failures.slice(0, 20)) console.error(`  - ${message}`);
  if (failures.length > 20) console.error(`  ... and ${failures.length - 20} more`);
  process.exit(1);
}

console.log('\nAll checks passed.');
