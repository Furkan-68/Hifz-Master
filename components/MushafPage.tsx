
import React, { useLayoutEffect, useRef, useState } from 'react';
import { AyahRange, MushafLine, Surah } from '../types';
import { pageFontFamily } from '../services/mushaf';

interface MushafPageProps {
  page: number;
  lines: MushafLine[];
  fontReady: boolean;
  selection: AyahRange | null;
  currentAyahNumber: number;
  basmala: string;
  /** The surah an ayah *opens*, or null if it merely continues one. Drives the bands. */
  surahOf: (ayah: number) => Surah | null;
  onPointerDown: (e: React.PointerEvent<HTMLElement>) => void;
  onClick: (e: React.MouseEvent<HTMLElement>) => void;
}

/**
 * One page of the Madinah Mushaf, line for line as it is printed.
 *
 * The glyphs are addressed in this page's own font, so nothing here is readable text - and
 * until that font has arrived the page stays empty rather than showing the codes in a
 * substitute face, which would be gibberish rather than a rough preview.
 *
 * Justification is the browser's: `text-align: justify` with `text-align-last: justify`
 * stretches the spaces inside a line until it fills the measure, which is what makes the line
 * breaks land where the print has them. That also keeps a selection continuous across the
 * words it covers, which a flexbox row of separate words would not.
 */
const MushafPage: React.FC<MushafPageProps> = ({
  page,
  lines,
  fontReady,
  selection,
  currentAyahNumber,
  basmala,
  surahOf,
  onPointerDown,
  onClick,
}) => {
  // Which blank line carries the basmala. A surah is introduced by the blank lines directly
  // above its opening line - usually two, sometimes one, occasionally three - so the gap is
  // read backwards from the line that starts the surah. The basmala takes the last of those
  // blank lines; any further one above it stays empty. The surah name is not printed: the
  // header already names the surahs a page holds.
  const basmalas = new Set<number>();

  lines.forEach((line, i) => {
    if (line.type !== 'ayah') return;
    const surah = surahOf(line.runs[0][0]);
    if (!surah) return; // the line does not open a surah, it only continues one

    let gap = 0;
    while (i - gap - 1 >= 0 && lines[i - gap - 1].type === 'blank') gap++;
    // Two surahs in the whole Mushaf get no blank line of their own. Borrowing a line from
    // the text would push the page out of true, which is the thing to avoid here.
    if (gap === 0) return;

    // At-Tawba has no basmala, and Al-Fatiha's is its first verse.
    if (surah.number === 1 || surah.number === 9) return;
    basmalas.add(i - 1);
  });

  const isSelected = (ayah: number) => !!selection && ayah >= selection.start && ayah <= selection.end;

  // A printed page is about 1.4 times as tall as its text block is wide, whatever it holds. So
  // the line height follows from how many lines there are - which is also why the eight-line
  // opening pages are set so much larger than the rest.
  const lineHeight = 140 / lines.length;
  const baseFont = lineHeight * 0.62;

  // The type has to be sized off the *width*: a Mushaf line is a fixed set of words that has to
  // fill the measure exactly, and the glyphs are drawn for that. A guess is not good enough -
  // five percent too large and the last word of a line wraps, which wrecks the whole page. So
  // the widest line of this page is measured unwrapped, and the type scaled to fit it.
  const pageRef = useRef<HTMLDivElement | null>(null);
  const [fit, setFit] = useState<number>(1);

  useLayoutEffect(() => {
    const root = pageRef.current;
    if (!fontReady || !root) return;
    let widest = 1;
    root.querySelectorAll<HTMLElement>('[data-mushaf-line]').forEach((line) => {
      // Measured at the base size rather than the current one, so this does not chase its own
      // result when the fit it computes is applied.
      const size = line.style.fontSize;
      const wrap = line.style.whiteSpace;
      line.style.fontSize = `${baseFont}cqw`;
      line.style.whiteSpace = 'nowrap';
      widest = Math.max(widest, line.scrollWidth / line.clientWidth);
      line.style.fontSize = size;
      line.style.whiteSpace = wrap;
    });
    setFit(0.99 / widest);
  }, [fontReady, page, baseFont]);

  const fontSize = baseFont * fit;

  return (
    <div
      // Container units so the whole page scales with its width and keeps its proportions,
      // rather than the type staying put while the page grows.
      ref={pageRef}
      style={{ containerType: 'inline-size' }}
      className="w-full max-w-3xl mx-auto"
    >
      <div
        className={`flex flex-col select-none transition-opacity duration-200 ${
          fontReady ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {lines.map((line, i) => {
          if (basmalas.has(i)) {
            return (
              <div key={i} style={{ height: `${lineHeight}cqw` }}
                className="flex items-center justify-center">
                <span className="font-arabic-display text-[3cqw] leading-none text-slate-700 dark:text-slate-200" dir="rtl">
                  {basmala}
                </span>
              </div>
            );
          }

          if (line.type !== 'ayah') return <div key={i} style={{ height: `${lineHeight}cqw` }} />;

          return (
            <div key={i} style={{ height: `${lineHeight}cqw` }}>
              <div
                data-mushaf-line
                dir="rtl"
                lang="ar"
                style={{
                  fontFamily: `"${pageFontFamily(page)}"`,
                  textAlign: 'justify',
                  textAlignLast: 'justify',
                  fontSize: `${fontSize}cqw`,
                  // The line box, not the glyph height. That makes each word's hit area as tall
                  // as the line, so a drag crossing the space between two lines keeps tracking
                  // instead of falling into dead ground and stopping.
                  lineHeight: `${lineHeight}cqw`,
                }}
                className="w-full text-slate-900 dark:text-slate-100"
              >
                {line.runs.map(([ayah, glyphs], r) => (
                  <span
                    key={r}
                    data-ayah-number={ayah}
                    onPointerDown={onPointerDown}
                    onClick={onClick}
                    // Vertical padding on an inline box overflows instead of pushing the lines
                    // apart, so this costs nothing in layout and closes the dead ground between
                    // two lines - where a drag would otherwise lose the verse it was tracking.
                    style={{ paddingBlock: '0.25em' }}
                    className={`cursor-pointer rounded transition-colors ${
                      ayah === currentAyahNumber
                        ? 'bg-indigo-200/70 dark:bg-indigo-500/40'
                        : isSelected(ayah)
                          ? 'bg-indigo-100/70 dark:bg-indigo-900/50'
                          : ''
                    }`}
                  >
                    {glyphs}
                    {r < line.runs.length - 1 ? ' ' : ''}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default React.memo(MushafPage);
