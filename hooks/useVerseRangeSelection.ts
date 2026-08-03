
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AyahRange } from '../types';

const MOUSE_DRAG_THRESHOLD = 4;   // px of travel before a mouse press counts as a drag
const TOUCH_DRIFT_TOLERANCE = 10; // px the finger may wander before we treat it as a scroll
const LONG_PRESS_MS = 350;        // hold duration that starts a selection on touch
const EDGE_ZONE = 80;             // px from the container edge that triggers auto-scroll
const EDGE_SPEED = 18;            // max px scrolled per frame while at the edge

export const normalizeRange = (a: number, b: number): AyahRange => ({
  start: Math.min(a, b),
  end: Math.max(a, b),
});

interface SelectionOptions {
  // The scrolling element that holds the ayah list; used for edge auto-scroll.
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  // Playback cursor as a global ayah number, used as the anchor for Shift+Click.
  currentNumber: number;
  // Called for a plain click on a verse (no drag, no modifier).
  onActivate: (number: number) => void;
}

/**
 * Drag-to-select a contiguous range of verses.
 *
 * Mouse: press and move more than a few pixels. Touch: hold for a moment, then drag —
 * a normal swipe still scrolls the page.
 *
 * All returned handlers keep a stable identity so the rows can stay memoized; the verse
 * number is read from the `data-ayah-number` attribute instead of being closed over. That
 * attribute is all a view has to provide - a verse card in the list, a word span on a Mushaf
 * page, the hit testing below does not care which.
 */
export const useVerseRangeSelection = ({ scrollContainerRef, currentNumber, onActivate }: SelectionOptions) => {
  const [selection, setSelection] = useState<AyahRange | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  // Mirrors of reactive values so the handlers below need no dependencies.
  const currentNumberRef = useRef<number>(currentNumber);
  currentNumberRef.current = currentNumber;
  const onActivateRef = useRef(onActivate);
  onActivateRef.current = onActivate;

  const anchorRef = useRef<number | null>(null);
  const originRef = useRef<{ x: number; y: number } | null>(null);
  const pointRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const pointerIdRef = useRef<number | null>(null);
  const isDraggingRef = useRef<boolean>(false);
  const didDragRef = useRef<boolean>(false);
  const lastNumberRef = useRef<number | null>(null);
  const longPressRef = useRef<number | null>(null);
  const edgeRafRef = useRef<number | null>(null);
  const moveRafRef = useRef<number | null>(null);

  // --- Picking a block by button, one edge per click ---

  // The verse whose button opened a block and is waiting for its second click. Held in a ref
  // as well so the handler can stay dependency-free and the rows memoized.
  const [blockAnchor, setBlockAnchor] = useState<number | null>(null);
  const blockAnchorRef = useRef<number | null>(null);

  const dropAnchor = useCallback(() => {
    blockAnchorRef.current = null;
    setBlockAnchor(null);
  }, []);

  const clearSelection = useCallback(() => {
    setSelection(null);
    dropAnchor();
  }, [dropAnchor]);

  const pickBlockEdge = useCallback((number: number) => {
    const anchor = blockAnchorRef.current;
    if (anchor === null) {
      blockAnchorRef.current = number;
      setBlockAnchor(number);
      setSelection(normalizeRange(number, number));
      return;
    }
    blockAnchorRef.current = null;
    setBlockAnchor(null);
    // Clicking the open edge a second time takes the block back instead of selecting the one
    // verse - that is the way out when the button was hit by mistake.
    setSelection(anchor === number ? null : normalizeRange(anchor, number));
  }, []);

  // A selection set from outside - a restored block, say - ends whatever the button had
  // half-picked; leaving the anchor behind would make the next click close a block against
  // a verse chosen long ago.
  const replaceSelection = useCallback((range: AyahRange | null) => {
    dropAnchor();
    setSelection(range);
  }, [dropAnchor]);

  // --- Hit testing ---

  // elementFromPoint rather than per-row onPointerEnter: on touch the pointer is
  // implicitly captured by the element it started on, so sibling rows never fire enter.
  const readNumberAtPoint = useCallback((): number | null => {
    const { x, y } = pointRef.current;
    const hit = document.elementFromPoint(x, y);
    const target = hit ? hit.closest('[data-ayah-number]') : null;
    if (!(target instanceof HTMLElement)) return null;
    const number = Number(target.dataset.ayahNumber);
    return Number.isFinite(number) ? number : null;
  }, []);

  const extendToPoint = useCallback(() => {
    const anchor = anchorRef.current;
    if (anchor === null || !isDraggingRef.current) return;
    const number = readNumberAtPoint();
    if (number === null || number === lastNumberRef.current) return;
    lastNumberRef.current = number;
    setSelection(normalizeRange(anchor, number));
  }, [readNumberAtPoint]);

  // --- Edge auto-scroll (so a range can reach past the visible screen) ---

  const edgeScrollStep = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container || !isDraggingRef.current) {
      edgeRafRef.current = null;
      return;
    }
    const rect = container.getBoundingClientRect();
    const y = pointRef.current.y;
    let delta = 0;
    if (y < rect.top + EDGE_ZONE) {
      delta = -EDGE_SPEED * Math.min(1, (rect.top + EDGE_ZONE - y) / EDGE_ZONE);
    } else if (y > rect.bottom - EDGE_ZONE) {
      delta = EDGE_SPEED * Math.min(1, (y - (rect.bottom - EDGE_ZONE)) / EDGE_ZONE);
    }
    if (delta !== 0) {
      container.scrollTop += delta;
      extendToPoint(); // rows slide underneath a stationary pointer
    }
    edgeRafRef.current = requestAnimationFrame(edgeScrollStep);
  }, [scrollContainerRef, extendToPoint]);

  // --- Gesture lifecycle ---

  const startDrag = useCallback((number: number) => {
    isDraggingRef.current = true;
    didDragRef.current = true;
    dropAnchor(); // a drag defines the whole block on its own
    anchorRef.current = number;
    lastNumberRef.current = number;
    setIsDragging(true);
    setSelection(normalizeRange(number, number));
    if (edgeRafRef.current === null) {
      edgeRafRef.current = requestAnimationFrame(edgeScrollStep);
    }
  }, [edgeScrollStep, dropAnchor]);

  const endPress = useCallback(() => {
    if (longPressRef.current !== null) {
      window.clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
    if (moveRafRef.current !== null) {
      cancelAnimationFrame(moveRafRef.current);
      moveRafRef.current = null;
      // Flush the pending frame so a quick release still ends where the pointer did.
      extendToPoint();
    }
    if (edgeRafRef.current !== null) {
      cancelAnimationFrame(edgeRafRef.current);
      edgeRafRef.current = null;
    }
    isDraggingRef.current = false;
    anchorRef.current = null;
    originRef.current = null;
    lastNumberRef.current = null;
    pointerIdRef.current = null;
    setIsDragging(false);
    // didDragRef is deliberately left alone - the click event still has to see it.
  }, [extendToPoint]);

  const handleRowPointerDown = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const number = Number(e.currentTarget.dataset.ayahNumber);
    if (!Number.isFinite(number)) return;

    didDragRef.current = false;
    anchorRef.current = number;
    lastNumberRef.current = number;
    originRef.current = { x: e.clientX, y: e.clientY };
    pointRef.current = { x: e.clientX, y: e.clientY };
    pointerIdRef.current = e.pointerId;

    if (e.pointerType === 'mouse') {
      e.preventDefault(); // stop the browser from starting a native text selection
    } else {
      longPressRef.current = window.setTimeout(() => {
        longPressRef.current = null;
        navigator.vibrate?.(10);
        startDrag(number);
      }, LONG_PRESS_MS);
    }
  }, [startDrag]);

  const handleContainerPointerMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (anchorRef.current === null) return;
    if (pointerIdRef.current !== null && e.pointerId !== pointerIdRef.current) return;

    pointRef.current = { x: e.clientX, y: e.clientY };

    if (!isDraggingRef.current) {
      const origin = originRef.current;
      if (!origin) return;
      const travelled = Math.hypot(e.clientX - origin.x, e.clientY - origin.y);

      if (e.pointerType === 'mouse') {
        if (travelled <= MOUSE_DRAG_THRESHOLD) return;
        startDrag(anchorRef.current);
        // Capture only once the drag is real, so a plain click still reaches the row.
        const container = scrollContainerRef.current;
        try {
          container?.setPointerCapture(e.pointerId);
        } catch {
          /* capture is a nicety - dragging still works without it */
        }
      } else {
        // The finger moved before the long press completed: this is a scroll, not a selection.
        if (travelled > TOUCH_DRIFT_TOLERANCE) endPress();
        return;
      }
    }

    if (moveRafRef.current !== null) return; // one update per frame
    moveRafRef.current = requestAnimationFrame(() => {
      moveRafRef.current = null;
      extendToPoint();
    });
  }, [startDrag, endPress, extendToPoint, scrollContainerRef]);

  const handleContainerPointerUp = useCallback(() => {
    endPress();
  }, [endPress]);

  const handleRowClick = useCallback((e: React.MouseEvent<HTMLElement>) => {
    if (didDragRef.current) {
      didDragRef.current = false; // this click is only the tail of a drag
      return;
    }
    const number = Number(e.currentTarget.dataset.ayahNumber);
    if (!Number.isFinite(number)) return;

    if (e.shiftKey) {
      blockAnchorRef.current = null;
      setBlockAnchor(null);
      setSelection(normalizeRange(currentNumberRef.current, number));
      return;
    }
    onActivateRef.current(number);
  }, []);

  // React attaches touchmove passively, so blocking the page scroll during a touch drag
  // needs its own non-passive listener.
  useEffect(() => {
    if (!isDragging) return;
    const block = (e: TouchEvent) => e.preventDefault();
    document.addEventListener('touchmove', block, { passive: false });
    return () => document.removeEventListener('touchmove', block);
  }, [isDragging]);

  useEffect(() => () => endPress(), [endPress]);

  return {
    selection,
    setSelection: replaceSelection,
    clearSelection,
    isDragging,
    blockAnchor,
    pickBlockEdge,
    containerProps: {
      onPointerMove: handleContainerPointerMove,
      onPointerUp: handleContainerPointerUp,
      onPointerCancel: handleContainerPointerUp,
    },
    rowProps: {
      onPointerDown: handleRowPointerDown,
      onClick: handleRowClick,
    },
  };
};
