import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, CornerDownLeft, BookOpen, X } from 'lucide-react';
import { Surah } from '../types';
import { JumpTarget, findJumpTargets } from '../services/jump';

interface JumpToProps {
  open: boolean;
  surahs: Surah[];
  onJump: (target: JumpTarget) => void;
  onClose: () => void;
}

/** Stable across a session and only ever cosmetic, so it is read once rather than watched. */
const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);
export const JUMP_SHORTCUT_HINT = IS_MAC ? '⌘K' : 'Ctrl K';

const targetKey = (t: JumpTarget) =>
  t.kind === 'page'
    ? `p${t.page}`
    : t.kind === 'surah'
      ? `s${t.surah.number}`
      : `a${t.surah.number}:${t.numberInSurah}`;

/**
 * Go to a surah, a verse or a printed page.
 *
 * One field for all three, because the three are not separate questions: what you have in
 * mind is a place in the Mushaf, and you know it by whichever handle came to you first - the
 * name, the numbers, or the page. So nothing is chosen up front. What is typed is read for
 * every meaning it could carry, and where it carries more than one they are all offered
 * rather than guessed between: typing "2" offers Al-Baqara and page 2 both.
 *
 * The fold behind the name matching is what makes the names findable at all - it ignores the
 * doubled vowels and the hyphens of the bundled romanisation, so what is typed almost never
 * has to be spelled the way the data spells it. See services/jump.ts.
 */
const JumpTo: React.FC<JumpToProps> = ({ open, surahs, onJump, onClose }) => {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const targets = useMemo(() => findJumpTargets(query, surahs), [query, surahs]);

  // Opening is what clears it: a palette that came back on the last query would have to be
  // emptied before it could be used again, and there is nothing to come back to - the jump
  // it describes has already happened.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
    // A frame's delay, so the element exists by the time it is focused.
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => setActive(0), [query]);

  // Keep the highlighted row in sight when the arrows walk past the bottom of the box.
  useEffect(() => {
    listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  const pick = (target: JumpTarget) => {
    onJump(target);
    onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (targets.length === 0) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => (i + step + targets.length) % targets.length);
      return;
    }
    if (e.key === 'Enter' && targets[active]) {
      e.preventDefault();
      pick(targets[active]);
      return;
    }
    if (e.key === 'Escape') {
      // The app closes whatever is open on top when Escape is pressed, and would otherwise
      // take the verse range behind this along with the palette.
      e.stopPropagation();
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center p-4 pt-[12vh] bg-slate-900/40 dark:bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-white dark:bg-slate-900 w-full max-w-lg max-h-[70vh] flex flex-col rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        onKeyDown={onKeyDown}
      >
        <div className="shrink-0 flex items-center gap-3 px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <Search className="w-5 h-5 shrink-0 text-slate-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Surah, verse or page..."
            // The browser's own history list would cover this one.
            autoComplete="off"
            spellCheck={false}
            className="flex-1 min-w-0 bg-transparent border-none outline-none text-base text-slate-800 dark:text-slate-100 placeholder:text-slate-400"
          />
          <button
            onClick={onClose}
            className="shrink-0 p-1.5 -mr-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto p-2">
          {targets.map((target, i) => {
            const isActive = i === active;
            return (
              <button
                key={targetKey(target)}
                onClick={() => pick(target)}
                // Movement rather than hover, so the row that happens to lie under a resting
                // mouse does not fight the arrow keys for the highlight.
                onMouseMove={() => setActive(i)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${
                  isActive
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {target.kind === 'page' ? (
                  <>
                    <span
                      className={`w-10 h-6 shrink-0 flex items-center justify-center rounded-full ${
                        isActive ? 'bg-indigo-500' : 'bg-slate-200 dark:bg-slate-700'
                      }`}
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                    </span>
                    <span className="flex-1 min-w-0 font-semibold text-sm">Page {target.page}</span>
                    <span className={`text-xs shrink-0 ${isActive ? 'text-indigo-100' : 'text-slate-400'}`}>
                      Mushaf
                    </span>
                  </>
                ) : (
                  <>
                    <span
                      className={`min-w-10 h-6 px-2 shrink-0 flex items-center justify-center rounded-full text-xs font-bold tabular-nums ${
                        isActive ? 'bg-indigo-500' : 'bg-slate-200 dark:bg-slate-700'
                      }`}
                    >
                      {target.kind === 'ayah'
                        ? `${target.surah.number}:${target.numberInSurah}`
                        : target.surah.number}
                    </span>
                    <span className="flex-1 min-w-0 truncate font-semibold text-sm">
                      {target.surah.englishName}
                      {target.kind === 'ayah' && (
                        <span className={`ml-2 font-normal ${isActive ? 'text-indigo-100' : 'text-slate-400'}`}>
                          Ayah {target.numberInSurah}
                        </span>
                      )}
                    </span>
                    <span className="font-quran text-lg shrink-0">{target.surah.name}</span>
                  </>
                )}
              </button>
            );
          })}

          {query.trim() !== '' && targets.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-slate-400">
              Nothing by that name or number.
            </p>
          )}

          {/* An empty field is the only place there is room to say what the field takes, and
              the only time it is worth reading. */}
          {query.trim() === '' && (
            <dl className="px-3 py-4 space-y-2 text-sm text-slate-500 dark:text-slate-400">
              {[
                ['Al-Baqara', 'by name, spelled however you like'],
                ['2:255', 'a verse, by surah and number'],
                ['Baqara 255', 'the same verse, by name'],
                ['page 300', 'a printed page of the Mushaf'],
              ].map(([example, means]) => (
                <div key={example} className="flex items-baseline gap-3">
                  <dt className="w-24 shrink-0 font-mono text-xs text-slate-600 dark:text-slate-300">
                    {example}
                  </dt>
                  <dd className="min-w-0">{means}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>

        {targets.length > 0 && (
          <div className="shrink-0 flex items-center justify-end gap-2 px-5 py-2.5 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-400">
            <span>&uarr;&darr; to choose</span>
            <CornerDownLeft className="w-3 h-3" />
            <span>to go</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default JumpTo;
