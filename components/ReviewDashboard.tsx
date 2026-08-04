
import React from 'react';
import { BookCheck, CalendarCheck, Lock, Play, Plus, Repeat, X } from 'lucide-react';
import { AyahRange, ReviewUnit, UnitRef, daysOverdue } from '../services/review';
import { Review } from '../hooks/useReview';

interface ReviewDashboardProps {
  review: Review;
  /** The page the new-unit card offers. */
  suggestion: number;
  /** Ayah range of a unit, or null while the Mushaf layout is still loading. */
  rangeOf: (unit: UnitRef) => AyahRange | null;
  /** "Page 41 · Al-Anfal" or "Al-Anfal". The surahs part waits for the layout; the page never. */
  label: (unit: UnitRef) => string;
  /** What is proposed for adoption, or null while there is nothing to propose. */
  proposal: UnitRef[] | null;
  onReview: (unit: UnitRef) => void;
  onPractice: (unit: UnitRef) => void;
}

const dueLabel = (unit: ReviewUnit, now: Date): string => {
  const late = daysOverdue(unit.card, now);
  if (late === 0) return 'due today';
  return late === 1 ? '1 day overdue' : `${late} days overdue`;
};

const nextLabel = (unit: ReviewUnit, now: Date): string => {
  const days = Math.round((unit.card.due.getTime() - now.getTime()) / 86400000);
  if (days <= 0) return 'due now';
  if (days === 1) return 'due tomorrow';
  return `due in ${days} days`;
};

const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <section className={`rounded-2xl border p-5 ${className}`}>{children}</section>
);

const Heading: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3">
    {children}
  </h2>
);

/**
 * The review view: what is waiting, whether a new unit is earned, and what is in rotation.
 *
 * Everything here is data from `services/review.ts`; the wording is the only thing this file
 * decides. A locked state never draws a disabled button - a disabled button invites the click
 * it then refuses. It names the obligation instead, and puts the way out of it next door.
 */
const ReviewDashboard: React.FC<ReviewDashboardProps> = ({
  review,
  suggestion,
  rangeOf,
  label,
  proposal,
  onReview,
  onPractice,
}) => {
  const { state, now, dueQueue, gate } = review;

  const size = (unit: UnitRef): string | null => {
    const range = rangeOf(unit);
    if (!range) return null;
    const count = range.end - range.start + 1;
    return count === 1 ? '1 ayah' : `${count} ayahs`;
  };

  return (
    <div className="max-w-2xl mx-auto w-full space-y-6 pb-12">
      {proposal && proposal.length > 0 && (
        <Card className="border-amber-200 dark:border-amber-900/60 bg-amber-50/60 dark:bg-amber-950/30">
          <h2 className="font-bold text-slate-800 dark:text-slate-100">
            You have already marked{' '}
            {proposal.filter((u) => u.kind === 'surah').length > 0 &&
              `${proposal.filter((u) => u.kind === 'surah').length} surah${
                proposal.filter((u) => u.kind === 'surah').length === 1 ? '' : 's'
              }`}
            {proposal.some((u) => u.kind === 'surah') && proposal.some((u) => u.kind === 'page') && ' and '}
            {proposal.filter((u) => u.kind === 'page').length > 0 &&
              `${proposal.filter((u) => u.kind === 'page').length} page${
                proposal.filter((u) => u.kind === 'page').length === 1 ? '' : 's'
              }`}{' '}
            as fully learned.
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Add them to the review rotation? They will all be due straight away — the first pass
            through each is what sets its schedule.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={() => review.adopt(proposal)}
              className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold transition-colors"
            >
              Add {proposal.length} unit{proposal.length === 1 ? '' : 's'}
            </button>
            <button
              onClick={review.declineAdoption}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors"
            >
              Not now
            </button>
          </div>
        </Card>
      )}

      {dueQueue.length > 0 && (
        <div>
          <Heading>Due today · {dueQueue.length}</Heading>
          <div className="space-y-2">
            {dueQueue.map((unit) => (
              <div
                key={`${unit.kind}:${unit.ref}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-sm text-slate-800 dark:text-slate-100 truncate">
                    {label(unit)}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {dueLabel(unit, now)}
                    {size(unit) && ` · ${size(unit)}`}
                  </div>
                </div>
                <button
                  onClick={() => onReview(unit)}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold transition-colors"
                >
                  <Play className="w-4 h-4 fill-current" />
                  Start
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {gate.open ? (
        <Card className="border-transparent bg-indigo-600 text-white shadow-lg shadow-indigo-100 dark:shadow-none">
          <div className="flex items-center gap-2 text-indigo-100 text-xs font-bold uppercase tracking-wider">
            <BookCheck className="w-4 h-4" />
            New material
          </div>
          <button
            onClick={() => onReview({ kind: 'page', ref: suggestion })}
            className="mt-2 text-xl font-bold hover:underline underline-offset-4"
          >
            Start page {suggestion}
          </button>
          <p className="mt-1 text-sm text-indigo-100">
            {state.units.length === 0
              ? 'Nothing is in rotation yet — this first pass sets its schedule.'
              : `${label(state.units[state.units.length - 1])} is settled — this one is earned.`}
          </p>
          <p className="mt-3 text-xs text-indigo-200">Or add a whole surah from the sidebar.</p>
        </Card>
      ) : (
        <Card className="border-slate-200 dark:border-slate-700 bg-slate-100/60 dark:bg-slate-900/60">
          <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500 text-xs font-bold uppercase tracking-wider">
            <Lock className="w-4 h-4" />
            New material waits
          </div>
          {gate.blocked?.kind === 'due' ? (
            <>
              <p className="mt-2 text-lg font-bold text-slate-700 dark:text-slate-200">
                {gate.blocked.units.length === 1
                  ? `${label(gate.blocked.units[0])} is waiting for review`
                  : `${gate.blocked.units.length} units are waiting for review`}
              </p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Clear the queue before starting something new.
              </p>
            </>
          ) : gate.blocked?.kind === 'unsettled' ? (
            <>
              <p className="mt-2 text-lg font-bold text-slate-700 dark:text-slate-200">
                {gate.blocked.lastGrade === null
                  ? `${label(gate.blocked.unit)} has not come back yet`
                  : gate.blocked.lastGrade < 3
                    ? `Consolidate ${label(gate.blocked.unit)} first`
                    : `${label(gate.blocked.unit)} needs one more pass`}
              </p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {gate.blocked.lastGrade !== null && gate.blocked.lastGrade < 3
                  ? 'It was halting last time. New units wait until the last three are solid.'
                  : `A unit vouches for itself only after its third rating — this one has ${gate.blocked.reviews}.`}
              </p>
              <button
                onClick={() => onPractice(gate.blocked!.kind === 'unsettled' ? gate.blocked.unit : { kind: 'page', ref: suggestion })}
                className="mt-3 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-800 transition-colors"
              >
                <Repeat className="w-4 h-4" />
                Practise {label(gate.blocked.unit)}
              </button>
            </>
          ) : null}
        </Card>
      )}

      <div>
        <Heading>
          In rotation · {state.units.length} unit{state.units.length === 1 ? '' : 's'}
        </Heading>
        {state.units.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-500">
            Nothing yet. A page or a surah joins the rotation the first time you drill it.
          </p>
        ) : (
          <div className="space-y-2">
            {state.units.map((unit) => (
              <div
                key={`${unit.kind}:${unit.ref}`}
                className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-sm text-slate-800 dark:text-slate-100 truncate">
                    {label(unit)}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                    <CalendarCheck className="w-3 h-3" />
                    {nextLabel(unit, now)}
                    {unit.card.reps > 0 && ` · ${unit.card.reps} rating${unit.card.reps === 1 ? '' : 's'}`}
                  </div>
                </div>
                <div className="shrink-0 flex items-center gap-1">
                  <button
                    onClick={() => onPractice(unit)}
                    title="Drill without changing the schedule"
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    Practise
                  </button>
                  <button
                    onClick={() => review.remove(unit)}
                    title="Remove from review — the verses stay marked as learned"
                    className="p-2 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {gate.open && state.units.length > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
          <Plus className="w-3 h-3" />
          A page can also be taken up from the Mushaf view, on the page itself.
        </p>
      )}
    </div>
  );
};

export default ReviewDashboard;
