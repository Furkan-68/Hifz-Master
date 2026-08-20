
import React, { useLayoutEffect, useRef, useState } from 'react';
import { AyahRange, MushafLine } from '../types';
import { BASMALA_GLYPH, lineFontFamily, pageFontFamily } from '../services/mushaf';

interface MushafPageProps {
  page: number;
  lines: MushafLine[];
  fontReady: boolean;
  selection: AyahRange | null;
  currentAyahNumber: number;
  /**
   * Global ayah number from which the page is covered up; null draws it as printed.
   *
   * A primitive rather than a set or a predicate, so the memo below still holds when the drill
   * advances one ayah. The decision is per run, which is exactly right: a run belongs to one
   * ayah and lies in one line, and just under half the verse lines here carry more than one
   * ayah - covering by line would be wrong about as often as it was right.
   */
  hiddenFrom?: number | null;
  // Optional because a word is not a selection handle in the drill: there, a tap means reveal,
  // and the session hangs its own handler on instead.
  onPointerDown?: (e: React.PointerEvent<HTMLElement>) => void;
  onClick?: (e: React.MouseEvent<HTMLElement>) => void;
}

/**
 * One page of the Madinah Mushaf, line for line as it is printed.
 *
 * The glyphs are addressed in the font that draws this page, so nothing here is readable text -
 * and until that font has arrived the page stays empty rather than showing the codes in a
 * substitute face, which would be gibberish rather than a rough preview. A page that opens a
 * surah waits on two fonts: its own, and the one the band is drawn from.
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
  hiddenFrom = null,
  onPointerDown,
  onClick,
}) => {
  const isSelected = (ayah: number) => !!selection && ayah >= selection.start && ayah <= selection.end;
  const isHidden = (ayah: number) => hiddenFrom !== null && ayah >= hiddenFrom;
  const isMarked = (ayah: number) => ayah === currentAyahNumber || isSelected(ayah);

  // A verse is marked by its own ink rather than by a band behind it, and ink only reads as
  // marked against verses set back from it - so the rest of the page has to give way. Two
  // things must not trigger that: a page with nothing marked on it, which would otherwise look
  // faded for no reason as soon as you turned to it, and the drill, where the mark sits on the
  // covered ayah and so has no ink to carry it. Hence the mark is looked for among the
  // *visible* runs only; where it lands on a covered one the page keeps its printed weight and
  // the band below does the marking instead.
  const pageMarked = lines.some(
    (line) => line.type === 'ayah' && line.runs.some(([ayah]) => isMarked(ayah) && !isHidden(ayah))
  );

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
          // The band naming a surah and the basmala below it are single glyphs the print sets
          // on lines of their own. Centred rather than justified: there is nothing to stretch
          // between. Both ink centred in their own advance box, so centring the box is enough.
          if (line.type === 'surah' || line.type === 'bismillah') {
            return (
              <div
                key={i}
                style={{ height: `${lineHeight}cqw` }}
                className="flex items-center justify-center"
              >
                <span
                  dir="rtl"
                  lang="ar"
                  style={{
                    fontFamily: `"${lineFontFamily(line, page)}"`,
                    fontSize: `${fontSize}cqw`,
                    lineHeight: 1,
                  }}
                  className="text-slate-900 dark:text-slate-100"
                >
                  {line.type === 'bismillah' ? BASMALA_GLYPH : line.glyph}
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
                  // The glyph codes sit in the Private Use Area, and Unicode gives that block
                  // the *left-to-right* bidi class. So a line of them is one long LTR run even
                  // inside dir="rtl": the browser sets the first word of the verse at the left
                  // edge and the last at the right, mirroring every line on the page. Each word
                  // still draws correctly, which is what makes it so easy to miss - read the
                  // line backwards and it says the right thing. Overriding the bidi algorithm
                  // is what puts the words back in printed order; it is safe here because a
                  // verse line holds nothing but these codes and the spaces between them, so
                  // there is no genuinely bidirectional text for the override to get wrong.
                  unicodeBidi: 'bidi-override',
                  fontSize: `${fontSize}cqw`,
                  // The line box, not the glyph height. That makes each word's hit area as tall
                  // as the line, so a drag crossing the space between two lines keeps tracking
                  // instead of falling into dead ground and stopping.
                  lineHeight: `${lineHeight}cqw`,
                }}
                className="w-full text-slate-900 dark:text-slate-100"
              >
                {line.runs.map(([ayah, glyphs], r) => {
                  const hidden = isHidden(ayah);
                  return (
                    <span
                      key={r}
                      data-ayah-number={ayah}
                      onPointerDown={onPointerDown}
                      onClick={onClick}
                      // Vertical padding on an inline box overflows instead of pushing the lines
                      // apart, so this costs nothing in layout and closes the dead ground between
                      // two lines - where a drag would otherwise lose the verse it was tracking.
                      // It is also why the one band left below has to stay translucent: an
                      // opaque one would visibly bleed into the lines above and below.
                      style={{ paddingBlock: '0.25em' }}
                      // Covered up by going transparent, never by being removed or replaced.
                      // The type on this page is sized by measuring its widest line
                      // (see below), so anything that changed a line's width would send that
                      // measurement chasing a new answer on every reveal - and the printed line
                      // breaks, the whole point of this view, would move. Transparent text
                      // changes no box at all, and fades in for free through the transition
                      // already here.
                      //
                      // Marking is done in ink rather than in colour behind the words: the verse
                      // being recited is set full black on light paper and full white on dark,
                      // the rest of the range a step back from it, and everything else on the
                      // page a good way further back still. The covered ayah is the exception,
                      // having no ink to carry a mark - there the band stays, to say where what
                      // is owed sits.
                      className={`cursor-pointer rounded transition-colors ${
                        hidden
                          ? `text-transparent ${
                              ayah === currentAyahNumber ? 'bg-indigo-200/70 dark:bg-indigo-500/40' : ''
                            }`
                          : ayah === currentAyahNumber
                            ? 'text-black dark:text-white'
                            : isSelected(ayah)
                              ? 'text-slate-700 dark:text-slate-300'
                              : pageMarked
                                ? 'text-slate-400 dark:text-slate-500'
                                : ''
                      }`}
                    >
                      {glyphs}
                      {r < line.runs.length - 1 ? ' ' : ''}
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default React.memo(MushafPage);
