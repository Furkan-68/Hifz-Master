
import React from 'react';
import { Brackets, CheckCircle2, ListEnd, ListStart } from 'lucide-react';
import { Ayah } from '../types';

interface AyahRowProps {
  ayah: Ayah;
  isCurrent: boolean;
  isSelected: boolean;
  isRangeStart: boolean;
  isRangeEnd: boolean;
  isLearned: boolean;
  /** This verse opened a block and is waiting for the click that closes it. */
  isBlockAnchor: boolean;
  /** Some other verse is waiting - a click here closes the block against it. */
  isBlockPending: boolean;
  showTranslation: boolean;
  translation: string | null;
  onPointerDown: (e: React.PointerEvent<HTMLElement>) => void;
  onClick: (e: React.MouseEvent<HTMLElement>) => void;
  onToggleLearned: (verseNumber: number) => void;
  onPickBlockEdge: (ayahNumber: number) => void;
}

/**
 * A single verse card. Memoized on purpose: Al-Baqara has 286 ayahs and a drag selection
 * updates the range on every pointer frame, so only the rows whose state actually changed
 * may re-render.
 */
const AyahRow: React.FC<AyahRowProps> = ({
  ayah,
  isCurrent,
  isSelected,
  isRangeStart,
  isRangeEnd,
  isLearned,
  isBlockAnchor,
  isBlockPending,
  showTranslation,
  translation,
  onPointerDown,
  onClick,
  onToggleLearned,
  onPickBlockEdge,
}) => {
  return (
    <div
      id={`ayah-${ayah.number}`}
      data-ayah-number={ayah.number}
      role="option"
      aria-selected={isSelected}
      onPointerDown={onPointerDown}
      onClick={onClick}
      className={`group relative p-6 rounded-2xl transition-colors duration-150 cursor-pointer border ${
        isCurrent
          ? 'bg-white dark:bg-slate-900 border-indigo-200 dark:border-indigo-800 shadow-xl shadow-indigo-50 dark:shadow-none'
          : isSelected
            ? 'bg-indigo-50/70 dark:bg-indigo-950/40 border-indigo-100 dark:border-indigo-900'
            : isLearned
              ? 'bg-emerald-50/40 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800'
              : 'bg-transparent border-transparent hover:bg-slate-50/50 dark:hover:bg-slate-800/50'
      }`}
    >
      {/* Range accent: rounded caps only at the ends, so the block reads as one unit
          even though the cards are spaced apart. */}
      {isSelected && (
        <div
          className={`absolute left-0 top-0 bottom-0 w-1 bg-indigo-400 ${
            isRangeStart ? 'rounded-t-full' : ''
          } ${isRangeEnd ? 'rounded-b-full' : ''}`}
        />
      )}

      <div className="flex flex-col gap-5">
        <div className="flex items-start justify-between gap-4">
          {/* Narrow left column so the check button never crowds the right-aligned Arabic. */}
          <div className="flex flex-col items-center gap-2 shrink-0">
            <div className={`flex items-center justify-center w-8 h-8 rounded-lg text-xs font-bold ${
              isCurrent
                ? 'bg-indigo-600 text-white'
                : isLearned
                  ? 'bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300'
                  : isSelected
                    ? 'bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-400 group-hover:bg-slate-200 dark:group-hover:bg-slate-700'
            }`}>
              {ayah.numberInSurah}
            </div>
            {/* Both buttons stop pointerdown and click: without that, pressing one would
                start the drag gesture and jump the playback cursor to this verse. */}
            <div className="flex items-center gap-1">
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); onToggleLearned(ayah.numberInSurah); }}
                aria-pressed={isLearned}
                title={isLearned ? 'Mark as not learned' : 'Mark as learned'}
                className={`rounded-full transition-all ${
                  isLearned
                    ? 'text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300'
                    : 'text-slate-300 dark:text-slate-500 opacity-0 group-hover:opacity-100 hover:text-emerald-500'
                }`}
              >
                <CheckCircle2 className="w-5 h-5" />
              </button>

              {/* Picking a block one edge per click - the way to a range that needs no drag
                  and no keyboard, so it works the same on a phone as on a desktop. */}
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); onPickBlockEdge(ayah.number); }}
                aria-pressed={isBlockAnchor}
                title={
                  isBlockAnchor
                    ? 'Block opens here - click again to drop it'
                    : isBlockPending
                      ? 'Close the block here'
                      : 'Open a block here'
                }
                className={`rounded-full transition-colors ${
                  isBlockAnchor
                    ? 'text-indigo-600 dark:text-indigo-400'
                    : isBlockPending
                      ? 'text-indigo-400 dark:text-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-300'
                      : 'text-slate-300 dark:text-slate-600 hover:text-indigo-500'
                }`}
              >
                {isBlockAnchor
                  ? <ListStart className="w-5 h-5" />
                  : isBlockPending
                    ? <ListEnd className="w-5 h-5" />
                    : <Brackets className="w-5 h-5" />}
              </button>
            </div>
          </div>
          <div
            className={`font-arabic-display text-right text-slate-800 dark:text-slate-100 transition-colors w-full ${
              isCurrent ? 'text-indigo-900 dark:text-indigo-200' : ''
            }`}
            dir="rtl"
          >
            {ayah.text}
          </div>
        </div>

        {showTranslation && (
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
            {translation ? (
              <p className="text-sm leading-relaxed text-slate-500 dark:text-slate-400" dir="ltr">
                {translation}
              </p>
            ) : (
              // Placeholder while the edition loads - without it nothing visibly happens
              // between flipping the switch and the response arriving.
              <div className="h-3 w-2/3 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default React.memo(AyahRow);
