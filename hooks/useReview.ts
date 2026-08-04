
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Grade } from 'ts-fsrs';
import {
  GateVerdict,
  ReviewState,
  ReviewUnit,
  UnitRef,
  addUnit as addUnitTo,
  adoptUnits,
  dueUnits,
  emptyReview,
  evaluateGate,
  findUnit,
  gradeUnit,
  hasStoredReview,
  readReview,
  removeUnit as removeUnitFrom,
  writeReview,
} from '../services/review';

/**
 * The review rotation as React state: the stored units, what is due, and whether a new unit is
 * earned. All the arithmetic lives in services/review.ts; this only holds it and persists it.
 */
export interface Review {
  state: ReviewState;
  /** Recomputed when the day turns, so a queue left open overnight is right in the morning. */
  now: Date;
  dueQueue: ReviewUnit[];
  gate: GateVerdict;
  /** Whether anything has ever been stored - the migration card's one question. */
  untouched: boolean;
  find: (unit: UnitRef) => ReviewUnit | undefined;
  isDueNow: (unit: UnitRef) => boolean;
  add: (unit: UnitRef) => void;
  grade: (unit: UnitRef, rating: Grade) => void;
  remove: (unit: UnitRef) => void;
  adopt: (units: UnitRef[]) => void;
  /** Writes an empty rotation, which is how "Not now" stops the migration card coming back. */
  declineAdoption: () => void;
}

/** Midnight tonight, in local time. */
const nextMidnight = (from: Date): number =>
  new Date(from.getFullYear(), from.getMonth(), from.getDate() + 1).getTime();

export const useReview = (): Review => {
  const [state, setState] = useState<ReviewState>(readReview);
  const [now, setNow] = useState<Date>(() => new Date());
  const [untouched, setUntouched] = useState<boolean>(() => !hasStoredReview());

  // The first render must not write: that would create the key and make the migration card
  // decide against itself before it has been shown.
  const written = useRef(false);
  useEffect(() => {
    if (!written.current) {
      written.current = true;
      return;
    }
    writeReview(state);
  }, [state]);

  // Due dates are days, so the only moment the queue can change on its own is midnight. One
  // timer for that, plus a check whenever the tab comes back - a laptop asleep across midnight
  // never fires the timer.
  useEffect(() => {
    const refresh = () => setNow((prev) => (Date.now() >= nextMidnight(prev) ? new Date() : prev));
    const timer = window.setTimeout(refresh, Math.max(1000, nextMidnight(now) - Date.now()));
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', refresh);
    };
  }, [now]);

  const dueQueue = useMemo(() => dueUnits(state, now), [state, now]);
  const gate = useMemo(() => evaluateGate(state, now), [state, now]);

  const find = useCallback((unit: UnitRef) => findUnit(state, unit), [state]);
  const isDueNow = useCallback(
    (unit: UnitRef) => dueQueue.some((u) => u.kind === unit.kind && u.ref === unit.ref),
    [dueQueue]
  );

  const settled = useCallback(() => setUntouched(false), []);

  const add = useCallback((unit: UnitRef) => {
    settled();
    setState((prev) => addUnitTo(prev, unit, new Date()));
  }, [settled]);

  const grade = useCallback((unit: UnitRef, rating: Grade) => {
    settled();
    setState((prev) => gradeUnit(prev, unit, rating, new Date()));
  }, [settled]);

  const remove = useCallback((unit: UnitRef) => {
    settled();
    setState((prev) => removeUnitFrom(prev, unit));
  }, [settled]);

  const adopt = useCallback((units: UnitRef[]) => {
    settled();
    setState((prev) => adoptUnits(prev, units, new Date()));
  }, [settled]);

  // Turning the card down has to leave a mark, or it comes back on the next load. Written
  // straight out rather than through the state effect, because the state does not change.
  const declineAdoption = useCallback(() => {
    settled();
    writeReview(emptyReview());
  }, [settled]);

  return { state, now, dueQueue, gate, untouched, find, isDueNow, add, grade, remove, adopt, declineAdoption };
};
