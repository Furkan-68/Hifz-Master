
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Eye, Undo2, X } from 'lucide-react';
import type { Card, Grade } from 'ts-fsrs';
import { AyahRange, MushafLine, Surah } from '../types';
import { UnitRef, HALTING, SOLID, FLUENT, previewGrades } from '../services/review';
import { getMushafPage, getPageOfAyah, loadPageFont, warmPageFont } from '../services/mushaf';
import MushafPage from './MushafPage';

interface ReviewSessionProps {
  unit: UnitRef;
  /** The ayahs to recite. Handed in whole, so the drill never asks what a unit is. */
  range: AyahRange;
  /** 'review' writes a schedule; 'practice' writes nothing at all. */
  mode: 'review' | 'practice';
  /** The card being drilled, for the price tags on the grading bar. Null for a new unit. */
  card: Card | null;
  title: string;
  basmala: string;
  surahOf: (ayah: number) => Surah | null;
  surahNameOf: (ayah: number) => string;
  onGrade: (rating: Grade) => void;
  onClose: () => void;
}

const GRADES: { rating: Grade; label: string; className: string }[] = [
  { rating: HALTING, label: 'Halting', className: 'bg-rose-600 hover:bg-rose-700' },
  { rating: SOLID, label: 'Solid', className: 'bg-indigo-600 hover:bg-indigo-700' },
  { rating: FLUENT, label: 'Fluent', className: 'bg-emerald-600 hover:bg-emerald-700' },
];

const inDays = (days: number): string =>
  days <= 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`;

/**
 * The drill: recite from memory with the page covered, uncover one ayah at a time, and rate the
 * whole unit once at the end.
 *
 * The entire state is one number. `revealed` counts how many ayahs of the unit are uncovered,
 * so the frontier - the ayah currently owed - is `range.start + revealed`, and the page on
 * screen is whichever page holds it. For a page unit that page never changes; for a surah the
 * drill turns the page by itself as the reveal crosses a break. Nothing here is persisted.
 */
const ReviewSession: React.FC<ReviewSessionProps> = ({
  unit,
  range,
  mode,
  card,
  title,
  basmala,
  surahOf,
  surahNameOf,
  onGrade,
  onClose,
}) => {
  const total = range.end - range.start + 1;
  const [revealed, setRevealed] = useState(0);
  const done = revealed >= total;

  // Clamped so the frontier stays inside the unit once everything is uncovered.
  const frontier = Math.min(range.start + revealed, range.end);
  const frontierPage = getPageOfAyah(frontier);

  const firstPage = getPageOfAyah(range.start);
  const lastPage = getPageOfAyah(range.end);

  // Which page is on screen. Follows the frontier, but can be paged away from to look back at
  // what came before - the arrows move this, never `revealed`.
  const [page, setPage] = useState(frontierPage);
  useEffect(() => {
    setPage(frontierPage);
  }, [frontierPage]);

  const [fontReady, setFontReady] = useState(false);
  const [fontFailed, setFontFailed] = useState(false);

  // The session holds its own font state rather than borrowing the Mushaf view's: that one is
  // tied to the page behind this overlay, which is rarely the page being drilled.
  useEffect(() => {
    let cancelled = false;
    setFontReady(false);
    setFontFailed(false);
    loadPageFont(page)
      .then(() => {
        if (!cancelled) setFontReady(true);
      })
      .catch((err) => {
        console.error(`Failed to load the font for page ${page}`, err);
        if (!cancelled) setFontFailed(true);
      });
    // A surah drill turns the page on its own, so the next one should already be there.
    if (page < lastPage) warmPageFont(page + 1);
    if (page > firstPage) warmPageFont(page - 1);
    return () => {
      cancelled = true;
    };
  }, [page, firstPage, lastPage]);

  const lines: MushafLine[] = useMemo(() => getMushafPage(page), [page]);

  const reveal = useCallback(() => {
    setRevealed((n) => Math.min(total, n + 1));
  }, [total]);

  const unreveal = useCallback(() => {
    setRevealed((n) => Math.max(0, n - 1));
  }, []);

  // Tapping a covered word uncovers up to and including that ayah - the same gesture on touch
  // and on a desktop, with no second code path.
  const onRunClick = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      const ayah = Number(e.currentTarget.dataset.ayahNumber);
      if (!Number.isFinite(ayah) || ayah < range.start || ayah > range.end) return;
      setRevealed((n) => Math.max(n, ayah - range.start + 1));
    },
    [range.start, range.end]
  );

  // Closing mid-drill throws the pass away, so it asks first - naming how far in you are,
  // because "41 of 286" is a different decision from "2 of 6".
  const requestClose = useCallback(() => {
    if (revealed > 0 && !done && !window.confirm(`Leave this drill? ${revealed} of ${total} revealed.`)) {
      return;
    }
    onClose();
  }, [revealed, done, total, onClose]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        requestClose();
        return;
      }
      if (e.code === 'Space') {
        // Twice over: space would scroll the page behind this, and it would also press the
        // focused Reveal button, firing the reveal a second time.
        e.preventDefault();
        if (!done) reveal();
        return;
      }
      if (e.code === 'Backspace') {
        e.preventDefault();
        unreveal();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [done, reveal, unreveal, requestClose]);

  const previews = useMemo(() => (card ? previewGrades(card, new Date()) : null), [card]);

  const pageCount = lastPage - firstPage + 1;
  const surahName = surahNameOf(frontier);

  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-slate-50 dark:bg-slate-950">
      <header className="shrink-0 border-b border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="font-bold text-slate-800 dark:text-slate-100 truncate">
              {title}
              {mode === 'practice' && (
                <span className="ml-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Practice
                </span>
              )}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              {surahName} · Ayah {Math.min(revealed + 1, total)} of {total}
              {pageCount > 1 && ` · page ${page - firstPage + 1} of ${pageCount}`}
            </div>
          </div>
          <button
            onClick={requestClose}
            title="Close"
            className="shrink-0 p-2 rounded-full text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="h-0.5 bg-slate-200 dark:bg-slate-700">
          <div
            className="h-full bg-indigo-600 transition-all duration-200"
            style={{ width: `${(revealed / total) * 100}%` }}
          />
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-6">
        {fontFailed ? (
          <p className="text-center py-20 text-sm text-rose-600 dark:text-rose-400">
            The page font could not be loaded. The Mushaf type comes off a CDN, so the drill needs
            a connection.
          </p>
        ) : (
          <>
            {pageCount > 1 && (
              <div className="flex items-center justify-center gap-4 mb-4">
                {/* The Mushaf is bound on the right, so the earlier page lies that way. */}
                <button
                  onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
                  disabled={page >= lastPage}
                  title="Later page"
                  className="p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full disabled:opacity-30"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 tabular-nums">
                  Page {page}
                  {page !== frontierPage && ' · looking back'}
                </span>
                <button
                  onClick={() => setPage((p) => Math.max(firstPage, p - 1))}
                  disabled={page <= firstPage}
                  title="Earlier page"
                  className="p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full disabled:opacity-30"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
            <MushafPage
              page={page}
              lines={lines}
              fontReady={fontReady}
              selection={null}
              // The session's own cursor, not the player's: the highlight has to sit on the ayah
              // being recited right now, which has nothing to do with where the audio stopped.
              currentAyahNumber={done ? 0 : frontier}
              basmala={basmala}
              surahOf={surahOf}
              // Null once the pass is done, so the page reads as printed again. Otherwise the
              // last page of a surah drill would keep whatever follows the unit covered for
              // good - you would have finished, owe nothing, and still be looking at a hole.
              hiddenFrom={done ? null : range.start + revealed}
              onClick={onRunClick}
            />
          </>
        )}
      </div>

      <footer className="shrink-0 border-t border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-2">
          {revealed > 0 && (
            <button
              onClick={unreveal}
              title="Cover the last ayah again (Backspace)"
              className="shrink-0 p-3 rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <Undo2 className="w-5 h-5" />
            </button>
          )}

          {!done ? (
            <button
              onClick={(e) => {
                // Without this the button keeps focus and the next space press would both run
                // this handler and re-activate the button.
                e.currentTarget.blur();
                reveal();
              }}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition-colors active:scale-[0.99]"
            >
              <Eye className="w-5 h-5" />
              Reveal next ayah
              <span className="text-xs font-normal text-indigo-200 hidden sm:inline">Space</span>
            </button>
          ) : mode === 'practice' ? (
            <button
              onClick={onClose}
              className="flex-1 py-3 rounded-xl bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 font-bold transition-colors"
            >
              Done
            </button>
          ) : (
            <div className="flex-1 grid grid-cols-3 gap-2">
              {GRADES.map(({ rating, label, className }) => (
                <button
                  key={rating}
                  onClick={() => onGrade(rating)}
                  className={`py-3 rounded-xl text-white font-bold transition-colors active:scale-[0.99] ${className}`}
                >
                  <span className="block">{label}</span>
                  {previews && (
                    <span className="block text-[11px] font-normal opacity-80">
                      {inDays(previews[rating])}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </footer>
    </div>
  );
};

export default ReviewSession;
