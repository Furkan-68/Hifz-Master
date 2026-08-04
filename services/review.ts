
import { Rating, State, fsrs, generatorParameters, createEmptyCard } from 'ts-fsrs';
import type { Card, Grade } from 'ts-fsrs';

/**
 * The review rotation: what is scheduled, when it is due, and whether a new unit is earned.
 *
 * Two rules shape this file.
 *
 * - **Nothing in here touches the browser or the rest of the app.** No `localStorage` at module
 *   level, no import from `services/mushaf` or `services/quranApi` - both read
 *   `import.meta.env` while they load and would throw under Node. That is what lets
 *   `scripts/check-review.mjs` import this module directly and check the half that is worth
 *   checking. Anything that needs to know which ayahs a unit covers takes a `RangeOf` callback.
 * - **`Card` is imported as a type.** Node strips types rather than compiling them, and a type
 *   left in a value import would be a missing export at runtime.
 */

// --- what a unit is -----------------------------------------------------------------------

export type UnitKind = 'page' | 'surah';

/** What a unit *is*, without any scheduling state. Enough to address one anywhere in the UI. */
export interface UnitRef {
  kind: UnitKind;
  ref: number; // page 1-604, or surah 1-114
}

/** A scheduled unit. `kind` + `ref` *are* the identity of the card. */
export interface ReviewUnit extends UnitRef {
  card: Card;               // dates alive, not strings
  addedAt: string;          // ISO, shown but never compared
  lastGrade: number | null; // the last rating; null before the first review
}

export interface ReviewState {
  version: 1;
  // In the order they were learned, oldest first. The array order *is* the record: "the last
  // three units" is a slice, not a sort, so it survives a timezone change, a wrong clock and
  // two units added in the same second.
  units: ReviewUnit[];
}

export const MAX_REF: Record<UnitKind, number> = { page: 604, surah: 114 };

export const unitKey = (u: UnitRef): string => `${u.kind}:${u.ref}`;

export const sameUnit = (a: UnitRef, b: UnitRef): boolean => a.kind === b.kind && a.ref === b.ref;

export interface AyahRange {
  start: number;
  end: number;
}

/**
 * Which ayahs a unit covers. Supplied by the caller, because the two kinds are not equally
 * cheap: a surah's range comes from the text, which is in memory from startup, while a page's
 * needs the 697 KB Mushaf layout. Null means "not knowable yet" - every surface has to be able
 * to draw that, and does, by naming the page without its surahs.
 */
export type RangeOf = (unit: UnitRef) => AyahRange | null;

export const rangeLength = (range: AyahRange): number => range.end - range.start + 1;

// --- the scheduler ------------------------------------------------------------------------

const SCHEDULER = fsrs(
  generatorParameters({
    // Both empty on purpose. The defaults are ['1m', '10m'], which would make a unit graded a
    // minute ago due again ten minutes later - and the gate below, which refuses a new unit
    // while anything is due, could then never open in the session that just learned something.
    // With no steps FSRS schedules in whole days from the first rating on.
    learning_steps: [],
    relearning_steps: [],
    // FSRS defaults to 36500 days. It was fitted on fact cards, where a decade-long interval is
    // a reasonable claim; a Mushaf page that has not been recited for a month is not memorized,
    // whatever the model says about it.
    //
    // Read as a target, not a hard ceiling: in the review state FSRS orders the three intervals
    // *after* clamping them, with good >= hard + 1 and easy >= good + 1. Once all three have
    // saturated, Solid comes out at 31 days and Fluent at 32. Two days over on a thirty day cap
    // is not worth rewriting the scheduler's output for - and cutting this to 28 to land on a
    // round number would be numerology.
    maximum_interval: 30,
    // Fuzz spreads a day's load across neighbouring days, which matters at hundreds of cards.
    // At roughly one new unit a week there is nothing to spread.
    enable_fuzz: false,
  })
);

/** The three ratings the drill offers. `Hard` is deliberately never produced. */
export const HALTING: Grade = Rating.Again;
export const SOLID: Grade = Rating.Good;
export const FLUENT: Grade = Rating.Easy;

export const newCard = (now: Date): Card => createEmptyCard(now);

export const gradeCard = (card: Card, now: Date, rating: Grade): Card =>
  SCHEDULER.next(card, now, rating).card;

/** The interval each rating would buy, in days - for the price tags on the grading bar. */
export const previewGrades = (card: Card, now: Date): Record<Grade, number> => ({
  [HALTING]: SCHEDULER.next(card, now, HALTING).card.scheduled_days,
  [Rating.Hard]: SCHEDULER.next(card, now, Rating.Hard).card.scheduled_days,
  [SOLID]: SCHEDULER.next(card, now, SOLID).card.scheduled_days,
  [FLUENT]: SCHEDULER.next(card, now, FLUENT).card.scheduled_days,
});

// --- storage ------------------------------------------------------------------------------

export const STORAGE_KEY = 'hifz_review';

export const emptyReview = (): ReviewState => ({ version: 1, units: [] });

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const reviveDate = (value: unknown): Date | null => {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/**
 * A stored card back into a real one, or null if it cannot be trusted.
 *
 * `JSON.stringify` writes a Date as an ISO string. FSRS itself copes - its scheduler converts
 * what it is handed - but nothing else here does: `isDue` compares `startOfDay(card.due)`, and
 * the dashboard formats that date. Both break on a string. A date that is not a date at all
 * makes FSRS throw rather than quietly miscalculate, which is the other reason to catch it
 * here, one entry at a time.
 */
export const reviveCard = (raw: any): Card | null => {
  if (!raw || typeof raw !== 'object') return null;

  const due = reviveDate(raw.due);
  if (!due) return null;

  // Absent is fine - a card that has never been reviewed has no last_review. Present but
  // unreadable is not.
  let lastReview: Date | undefined;
  if (raw.last_review !== undefined && raw.last_review !== null) {
    const parsed = reviveDate(raw.last_review);
    if (!parsed) return null;
    lastReview = parsed;
  }

  const numbers = {
    stability: raw.stability,
    difficulty: raw.difficulty,
    elapsed_days: raw.elapsed_days,
    scheduled_days: raw.scheduled_days,
    learning_steps: raw.learning_steps,
    reps: raw.reps,
    lapses: raw.lapses,
    state: raw.state,
  };
  for (const value of Object.values(numbers)) {
    if (!isFiniteNumber(value)) return null;
  }
  if (!(numbers.state in State)) return null;

  return { ...(numbers as Omit<Card, 'due' | 'last_review'>), due, last_review: lastReview };
};

const reviveUnit = (raw: any): ReviewUnit | null => {
  if (!raw || typeof raw !== 'object') return null;

  // An entry written before units had a kind. Three lines, and no development-time leftover in
  // a browser turns into a lost rotation.
  const kind: unknown = raw.kind ?? (raw.page !== undefined ? 'page' : undefined);
  if (kind !== 'page' && kind !== 'surah') return null;

  const ref = raw.ref ?? raw.page;
  if (!Number.isInteger(ref) || ref < 1 || ref > MAX_REF[kind]) return null;

  const card = reviveCard(raw.card);
  if (!card) return null;

  const lastGrade = isFiniteNumber(raw.lastGrade) ? raw.lastGrade : null;
  const addedAt = typeof raw.addedAt === 'string' ? raw.addedAt : new Date(0).toISOString();

  return { kind, ref, card, addedAt, lastGrade };
};

/**
 * Pure counterpart to `readReview`. Discards **per entry** rather than wholesale: an unreadable
 * unit must not cost the whole rotation, which is a month of scheduling for a line of bad JSON.
 */
export const parseReview = (raw: string | null): ReviewState => {
  if (!raw) return emptyReview();
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return emptyReview();
  }
  if (!parsed || typeof parsed !== 'object' || parsed.version !== 1) return emptyReview();
  if (!Array.isArray(parsed.units)) return emptyReview();

  const units: ReviewUnit[] = [];
  const seen = new Set<string>();
  for (const entry of parsed.units) {
    const unit = reviveUnit(entry);
    if (!unit) continue;
    const key = unitKey(unit);
    if (seen.has(key)) continue; // first one wins
    seen.add(key);
    units.push(unit);
  }
  return { version: 1, units };
};

export const serializeReview = (state: ReviewState): string => JSON.stringify(state);

export const readReview = (): ReviewState => {
  try {
    return parseReview(localStorage.getItem(STORAGE_KEY));
  } catch {
    return emptyReview();
  }
};

export const writeReview = (state: ReviewState): void => {
  try {
    localStorage.setItem(STORAGE_KEY, serializeReview(state));
  } catch {
    /* a full or blocked storage must not take the session down with it */
  }
};

/** Whether anything has been stored yet - the one question the migration card asks. */
export const hasStoredReview = (): boolean => {
  try {
    return localStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    return true; // no storage, no migration prompt
  }
};

// --- due dates ----------------------------------------------------------------------------

const startOfDay = (date: Date): number =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

/**
 * Due is a **day**, not a moment. A unit planned for today is due at breakfast, not at the
 * hour it happened to be graded four days ago - comparing the timestamps would answer "come
 * back at 21:14" to someone sitting down at eight in the morning.
 */
export const isDue = (card: Card, now: Date): boolean => startOfDay(card.due) <= startOfDay(now);

/** How many whole days a unit is late. 0 while it is due today. */
export const daysOverdue = (card: Card, now: Date): number =>
  Math.max(0, Math.round((startOfDay(now) - startOfDay(card.due)) / 86400000));

/** Everything due, longest overdue first. */
export const dueUnits = (state: ReviewState, now: Date): ReviewUnit[] =>
  state.units
    .filter((unit) => isDue(unit.card, now))
    .sort((a, b) => a.card.due.getTime() - b.card.due.getTime());

// --- the gate -----------------------------------------------------------------------------

/** How many of the most recently learned units have to carry their weight. */
const CONSOLIDATION_WINDOW = 3;
/** The grade each of them must have reached last time. */
const CONSOLIDATION_GRADE: number = SOLID;
/**
 * ... over at least this many ratings, so a unit cannot vouch for itself on the day it was
 * learned.
 *
 * `card.reps` counts ratings, not days, so on its own this would be satisfied by three
 * ratings in one sitting. What makes it mean "three days apart" is the rule that a unit is
 * only gradable while it is due (or brand new): every other way into the drill is practice and
 * writes nothing. Since FSRS without learning steps always schedules at least one day ahead,
 * two ratings of the same unit can never fall on the same day. Keep that rule if you touch
 * this number.
 */
const CONSOLIDATION_REVIEWS = 3;

export interface GateVerdict {
  open: boolean;
  /** Always populated when closed, so a locked state can name what it is holding back. */
  blocked:
    | null
    | { kind: 'due'; units: UnitRef[] }
    | { kind: 'unsettled'; unit: UnitRef; lastGrade: number | null; reviews: number };
}

/**
 * Whether a new unit is earned. Counts cards only - it knows nothing about pages, surahs or
 * ayah ranges, which is why it needs no layout and is right from the first paint.
 *
 * The order of the checks is the order of the work: clear what is due, then settle what is not
 * yet settled. An empty rotation is open - a new user has to be able to start.
 */
export const evaluateGate = (state: ReviewState, now: Date): GateVerdict => {
  const due = dueUnits(state, now);
  if (due.length > 0) {
    return { open: false, blocked: { kind: 'due', units: due.map(({ kind, ref }) => ({ kind, ref })) } };
  }

  for (const unit of state.units.slice(-CONSOLIDATION_WINDOW)) {
    const settled =
      unit.lastGrade !== null &&
      unit.lastGrade >= CONSOLIDATION_GRADE &&
      unit.card.reps >= CONSOLIDATION_REVIEWS;
    if (settled) continue;
    return {
      open: false,
      blocked: {
        kind: 'unsettled',
        unit: { kind: unit.kind, ref: unit.ref },
        lastGrade: unit.lastGrade,
        reviews: unit.card.reps,
      },
    };
  }

  return { open: true, blocked: null };
};

// --- suggesting the next page -------------------------------------------------------------

/**
 * Which page to offer next. A suggestion, not a permission - deliberately not part of the gate.
 *
 * Page-only: surahs are taken up on purpose, not in sequence. The direction comes from the last
 * two page units, so someone working backwards through Juz 'Amma gets the right suggestion from
 * their second page onwards.
 */
export const suggestNextPage = (state: ReviewState, fallback: number): number => {
  const pages = state.units.filter((u) => u.kind === 'page').map((u) => u.ref);
  if (pages.length === 0) return Math.min(MAX_REF.page, Math.max(1, fallback));

  const last = pages[pages.length - 1];
  const previous = pages.length > 1 ? pages[pages.length - 2] : null;
  const step = previous !== null && previous > last ? -1 : 1;

  const taken = new Set(pages);
  for (let page = last + step; page >= 1 && page <= MAX_REF.page; page += step) {
    if (!taken.has(page)) return page;
  }
  // Walked off the end with everything in that direction already taken.
  for (let page = last - step; page >= 1 && page <= MAX_REF.page; page -= step) {
    if (!taken.has(page)) return page;
  }
  return last;
};

// --- adopting what is already marked learned ----------------------------------------------

const fullyLearned = (
  kind: UnitKind,
  isLearned: (globalAyah: number) => boolean,
  rangeOf: RangeOf
): number[] => {
  const found: number[] = [];
  for (let ref = 1; ref <= MAX_REF[kind]; ref++) {
    const range = rangeOf({ kind, ref });
    if (!range) continue; // the layout is not loaded, so pages cannot be judged yet
    let complete = true;
    for (let ayah = range.start; ayah <= range.end; ayah++) {
      if (!isLearned(ayah)) {
        complete = false;
        break;
      }
    }
    if (complete) found.push(ref);
  }
  return found;
};

export const fullyLearnedSurahs = (
  isLearned: (globalAyah: number) => boolean,
  rangeOf: RangeOf
): number[] => fullyLearned('surah', isLearned, rangeOf);

export const fullyLearnedPages = (
  isLearned: (globalAyah: number) => boolean,
  rangeOf: RangeOf
): number[] => fullyLearned('page', isLearned, rangeOf);

/**
 * Thins a set of proposals down to ones that do not overlap: surahs first, longest first within
 * a kind, and a unit is kept only if *none* of its ayahs is already spoken for.
 *
 * Without this, someone who marked Al-Baqara would be offered the surah *and* its 48 pages, and
 * someone who marked everything would be offered all 114 surahs *plus* the three dozen pages
 * that straddle a surah boundary and so sit inside none of them.
 *
 * "None of its ayahs" rather than "not all of them" on purpose. Two overlapping units mean
 * reciting the same ayahs twice on two different schedules, for as long as both stay in the
 * rotation; a unit dropped here costs nothing but a later click. So the proposal is a partition
 * of what is known, never a cover of it.
 *
 * Surahs outrank pages regardless of length - a surah has a name, and it can be described
 * before the Mushaf layout has loaded. Ranking by length alone would let a page that straddles
 * a surah boundary knock out the surah it starts in, and the ayahs of that surah on the page
 * before would then be proposed by nothing at all.
 */
export const disjointUnits = (candidates: UnitRef[], rangeOf: RangeOf): UnitRef[] => {
  const withRange = candidates
    .map((unit) => ({ unit, range: rangeOf(unit) }))
    .filter((entry): entry is { unit: UnitRef; range: AyahRange } => entry.range !== null)
    .sort((a, b) => {
      if (a.unit.kind !== b.unit.kind) return a.unit.kind === 'surah' ? -1 : 1;
      const byLength = rangeLength(b.range) - rangeLength(a.range);
      return byLength !== 0 ? byLength : a.range.start - b.range.start;
    });

  const kept: { unit: UnitRef; range: AyahRange }[] = [];
  for (const entry of withRange) {
    const clashes = kept.some(
      ({ range }) => entry.range.start <= range.end && entry.range.end >= range.start
    );
    if (!clashes) kept.push(entry);
  }

  return kept.sort((a, b) => a.range.start - b.range.start).map(({ unit }) => unit);
};

/** Everything already marked learned, as non-overlapping units in Mushaf order. */
export const proposeAdoption = (
  isLearned: (globalAyah: number) => boolean,
  rangeOf: RangeOf
): UnitRef[] => {
  const candidates: UnitRef[] = [
    ...fullyLearnedSurahs(isLearned, rangeOf).map((ref): UnitRef => ({ kind: 'surah', ref })),
    ...fullyLearnedPages(isLearned, rangeOf).map((ref): UnitRef => ({ kind: 'page', ref })),
  ];
  return disjointUnits(candidates, rangeOf);
};

// --- mutations ----------------------------------------------------------------------------

export const findUnit = (state: ReviewState, unit: UnitRef): ReviewUnit | undefined =>
  state.units.find((u) => sameUnit(u, unit));

/** Appends to the end, because the end of the array is "most recently learned". */
export const addUnit = (state: ReviewState, unit: UnitRef, now: Date): ReviewState => {
  if (findUnit(state, unit)) return state;
  return {
    ...state,
    units: [
      ...state.units,
      { ...unit, card: newCard(now), addedAt: now.toISOString(), lastGrade: null },
    ],
  };
};

export const removeUnit = (state: ReviewState, unit: UnitRef): ReviewState => ({
  ...state,
  units: state.units.filter((u) => !sameUnit(u, unit)),
});

export const gradeUnit = (
  state: ReviewState,
  unit: UnitRef,
  rating: Grade,
  now: Date
): ReviewState => ({
  ...state,
  units: state.units.map((u) =>
    sameUnit(u, unit) ? { ...u, card: gradeCard(u.card, now, rating), lastGrade: rating } : u
  ),
});

/** Takes up several at once, in the order given. Used only by the migration card. */
export const adoptUnits = (state: ReviewState, units: UnitRef[], now: Date): ReviewState =>
  units.reduce((acc, unit) => addUnit(acc, unit, now), state);
