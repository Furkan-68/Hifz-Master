
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Surah, SurahDetail, AyahRange } from './types';
import {
  loadQuranData,
  getSurahs,
  getSurahDetail,
  getAyahByNumber,
  fetchTranslation,
  getAyahAudioUrl,
  TOTAL_AYAHS,
} from './services/quranApi';
import {
  loadMushaf,
  getMushafPage,
  getPageOfAyah,
  getPageRange,
  loadPageFont,
  warmPageFont,
  MUSHAF_PAGES,
} from './services/mushaf';
import AyahRow from './components/AyahRow';
import MushafPage from './components/MushafPage';
import { useVerseRangeSelection } from './hooks/useVerseRangeSelection';
import {
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  Settings,
  Search,
  Volume2,
  List,
  X,
  Minus,
  Plus,
  CheckCircle2,
  Sun,
  Moon,
  SlidersHorizontal,
  Type,
  BookMarked,
  Rows3
} from 'lucide-react';

type Theme = 'light' | 'dark';
type View = 'list' | 'mushaf';

// One control, two states - so the button toggles rather than cycles.
const OTHER_THEME: Record<Theme, Theme> = { light: 'dark', dark: 'light' };
const THEME_ICON: Record<Theme, typeof Sun> = { light: Sun, dark: Moon };
const THEME_LABEL: Record<Theme, string> = { light: 'Light', dark: 'Dark' };

// The OS preference decides where an unconfigured app starts, but it is resolved to a plain
// light or dark straight away - that is what lets the button show a sun or a moon instead of
// a monitor standing in for "whatever the system happens to say". A stored 'system' from the
// earlier three-way control means the theme was never really chosen, so it lands here too.
const readTheme = (): Theme => {
  try {
    const stored = localStorage.getItem('hifz_theme');
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    /* fall through to the OS preference */
  }
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const MAX_VERSE_REPEAT = 10;
// The pause is a multiple of how long one pass through the selection takes, so it scales
// with the material instead of being a fixed number of seconds.
const MAX_PAUSE_FACTOR = 3;
const PAUSE_FACTOR_STEP = 0.25;
// Below a second there is nothing you can do with the silence, so a pause that is switched
// on at all lasts at least this long - however short the verse or small the factor.
const MIN_PAUSE_SECONDS = 1;

const MIN_PLAYBACK_RATE = 0.5;
const MAX_PLAYBACK_RATE = 2;
const PLAYBACK_RATE_STEP = 0.25;

// Edition ids, matching the files in public/data/translations. Adding one here means adding
// it to TRANSLATIONS in scripts/fetch-quran.mjs and re-running `npm run fetch:quran`.
// Note that M.A.S. Abdel Haleem is only on quran.com, so alquran.cloud cannot supply it.
const TRANSLATIONS = [
  { id: 'en.itani', name: "Clear Qur'an", author: 'Talal Itani' },
  { id: 'en.sahih', name: 'Saheeh International', author: 'Saheeh International' },
  { id: 'en.pickthall', name: 'Pickthall', author: 'Marmaduke Pickthall' },
  { id: 'en.yusufali', name: 'Yusuf Ali', author: 'Abdullah Yusuf Ali' },
  { id: 'en.asad', name: 'The Message of the Qur’an', author: 'Muhammad Asad' }
];

// The ids match the [data-arabic-font] rules in index.html, which hold the actual font families
// and their size and leading. Nothing about a font file belongs in here.
//
// All four were checked against every one of the 69 codepoints in public/data/quran.json: they
// render the Tanzil Uthmani text, marks and all. The obvious omission is the KFGQPC font of the
// printed Madinah Mushaf, which cannot - it expects the KFGQPC text edition, where a silent
// alef carries U+0652 rather than the U+06DF this text uses. See todo.md.
const ARABIC_FONTS = [
  { id: 'scheherazade', name: 'Scheherazade New', note: 'Naskh, SIL — the default' },
  { id: 'amiri-quran', name: 'Amiri Quran', note: 'Naskh of the 1924 Cairo edition' },
  { id: 'amiri', name: 'Amiri', note: 'The same face, wider and less compact' },
  { id: 'noto-naskh', name: 'Noto Naskh Arabic', note: 'Modern Naskh, Google' }
];

const DEFAULT_ARABIC_FONT = 'scheherazade';

// Printed as a heading above every surah but Al-Fatiha and At-Tawba, and used as the specimen
// in the font picker - a line you will actually read, rather than a pangram.
const BASMALA = 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ';

const RECITERS = [
  { id: 'ar.alafasy', name: 'Mishary Rashid Alafasy' },
  { id: 'ar.abdulsamad', name: 'Abdul Basit' },
  { id: 'ar.minshawi', name: 'Al-Minshawi' },
  { id: 'ar.husary', name: 'Al-Husary' }
];

type PauseFactors = Record<string, number>;

// Surah number -> sorted numberInSurah. Deliberately not array indices: the data stays
// valid regardless of how the list is rendered, and it is readable in localStorage.
type LearnedMap = Record<string, number[]>;

const readLearned = (): LearnedMap => {
  try {
    const raw = localStorage.getItem('hifz_learned');
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as LearnedMap;
  } catch {
    /* fall through to an empty map */
  }
  return {};
};

const clampFactor = (value: number): number =>
  Number.isFinite(value) ? Math.min(MAX_PAUSE_FACTOR, Math.max(0, value)) : 0;

// How long a pause really lasts: the factor times what it measures, but never under the
// minimum. A factor of 0 stays a true 0 - that is the switch for seamless playback, and the
// floor must not turn it into a second of silence.
const pauseSeconds = (basisSeconds: number, factor: number): number =>
  factor > 0 ? Math.max(basisSeconds * factor, MIN_PAUSE_SECONDS) : 0;

// Reciters differ in tempo, so a factor that leaves you enough time to recite along is
// a per-reciter preference rather than a global one. Both pauses are stored that way.
const readFactorMap = (key: string): PauseFactors => {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed as PauseFactors;
    }
  } catch {
    /* fall through to an empty map */
  }
  return {};
};

const readPauseFactors = (): PauseFactors => {
  const stored = readFactorMap('hifz_pause_factors');
  if (Object.keys(stored).length > 0) return stored;
  try {
    // Carry over the value from when one factor was shared by all reciters.
    const legacy = clampFactor(Number(localStorage.getItem('hifz_pause_factor')));
    if (legacy > 0) {
      return { [localStorage.getItem('hifz_reciter') || 'ar.alafasy']: legacy };
    }
  } catch {
    /* no legacy value to carry over */
  }
  return {};
};

// One range at a time, in global ayah numbers. An entry carrying a `surah` key is from when
// ranges were indices into a single surah - too little to migrate, so it is dropped.
const readStoredSelection = (): AyahRange | null => {
  try {
    const raw = localStorage.getItem('hifz_selection');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.surah !== undefined) return null;
    const start = Math.max(1, Math.min(Number(parsed.start), TOTAL_AYAHS));
    const end = Math.max(start, Math.min(Number(parsed.end), TOTAL_AYAHS));
    if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
    return { start, end };
  } catch {
    return null;
  }
};

interface StepperProps {
  label?: string; // omitted where a surrounding row already names the control
  value: string;
  title: string;
  canDecrease: boolean;
  canIncrease: boolean;
  onDecrease: () => void;
  onIncrease: () => void;
}

const Stepper: React.FC<StepperProps> = ({ label, value, title, canDecrease, canIncrease, onDecrease, onIncrease }) => (
  <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-full p-1" title={title}>
    <button
      onClick={onDecrease}
      disabled={!canDecrease}
      className="w-6 h-6 rounded-full flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-900 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
    >
      <Minus className="w-3 h-3" />
    </button>
    <span className="text-xs font-bold text-slate-700 dark:text-slate-200 min-w-[2.75rem] text-center tabular-nums">{value}</span>
    <button
      onClick={onIncrease}
      disabled={!canIncrease}
      className="w-6 h-6 rounded-full flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-900 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
    >
      <Plus className="w-3 h-3" />
    </button>
    {label && <span className="text-[10px] tracking-wider text-slate-400 pr-2 hidden sm:inline">{label}</span>}
  </div>
);

const App: React.FC = () => {
  // --- State ---
  const [surahs, setSurahs] = useState<Surah[]>([]);
  const [currentSurah, setCurrentSurah] = useState<SurahDetail | null>(null);
  const [selectedSurahNumber, setSelectedSurahNumber] = useState<number>(1);
  // The playback cursor, as a global ayah number. 0 until the first surah is loaded.
  const [currentAyahNumber, setCurrentAyahNumber] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isPausing, setIsPausing] = useState<boolean>(false);
  const [verseRepeat, setVerseRepeat] = useState<number>(() => {
    const saved = Number(localStorage.getItem('hifz_verse_repeat'));
    return saved >= 1 && saved <= MAX_VERSE_REPEAT ? saved : 1;
  });
  const [pauseFactors, setPauseFactors] = useState<PauseFactors>(readPauseFactors);
  const [versePauseFactors, setVersePauseFactors] = useState<PauseFactors>(
    () => readFactorMap('hifz_verse_pause_factors')
  );
  const [playbackRate, setPlaybackRate] = useState<number>(() => {
    const saved = Number(localStorage.getItem('hifz_playback_rate'));
    return saved >= MIN_PLAYBACK_RATE && saved <= MAX_PLAYBACK_RATE ? saved : 1;
  });
  // Length of one pass through the selection, measured while it plays.
  const [passSeconds, setPassSeconds] = useState<number>(0);
  const [verseSeconds, setVerseSeconds] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [reciter, setReciter] = useState<string>(() => {
    return localStorage.getItem('hifz_reciter') || 'ar.alafasy';
  });
  const [showSidebar, setShowSidebar] = useState<boolean>(true);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [showPlayback, setShowPlayback] = useState<boolean>(false);
  const [theme, setTheme] = useState<Theme>(readTheme);
  const [showTranslation, setShowTranslation] = useState<boolean>(() => {
    const saved = localStorage.getItem('hifz_show_translation');
    return saved !== null ? JSON.parse(saved) : false;
  });
  const [translationEdition, setTranslationEdition] = useState<string>(() => {
    return localStorage.getItem('hifz_translation') || 'en.itani';
  });
  const [arabicFont, setArabicFont] = useState<string>(() => {
    const saved = localStorage.getItem('hifz_arabic_font');
    return ARABIC_FONTS.some(f => f.id === saved) ? saved! : DEFAULT_ARABIC_FONT;
  });
  const [view, setView] = useState<View>(
    () => (localStorage.getItem('hifz_view') === 'mushaf' ? 'mushaf' : 'list')
  );
  const [mushafPage, setMushafPage] = useState<number>(1);
  // The layout and each page's font arrive over time, so the page tracks its own readiness.
  const [mushafReady, setMushafReady] = useState<boolean>(false);
  const [pageFontReady, setPageFontReady] = useState<boolean>(false);
  const [mushafFailed, setMushafFailed] = useState<boolean>(false);
  // Kept parallel to currentSurah.ayahs rather than merged into them, so the fetched API
  // objects stay untouched and caching per edition stays trivial.
  const [translations, setTranslations] = useState<string[] | null>(null);
  const [translationFailed, setTranslationFailed] = useState<boolean>(false);
  const [learned, setLearned] = useState<LearnedMap>(readLearned);

  // Both pause factors belong to the reciter you are listening to.
  const pauseFactor = clampFactor(pauseFactors[reciter] ?? 0);
  const versePauseFactor = clampFactor(versePauseFactors[reciter] ?? 0);
  // Functional update, so rapid clicks batched into one render still all count.
  const setPauseFactor = useCallback((update: (prev: number) => number) => {
    setPauseFactors(prev => ({
      ...prev,
      [reciter]: clampFactor(update(clampFactor(prev[reciter] ?? 0))),
    }));
  }, [reciter]);
  const setVersePauseFactor = useCallback((update: (prev: number) => number) => {
    setVersePauseFactors(prev => ({
      ...prev,
      [reciter]: clampFactor(update(clampFactor(prev[reciter] ?? 0))),
    }));
  }, [reciter]);

  // --- Refs ---
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playPromiseRef = useRef<Promise<void> | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  // "The user wants audio running." Kept in a ref because the media element emits `pause`
  // right before `ended`, which would otherwise wipe the state flag before the effect
  // that advances to the next verse gets to read it.
  const playbackIntentRef = useRef<boolean>(false);
  const pauseTimerRef = useRef<number | null>(null);
  const playCountRef = useRef<number>(0);
  const playbackDrivenRef = useRef<boolean>(false);
  // Accumulates the current pass. Each verse counts once, so verse repeats do not inflate it.
  const passDurationRef = useRef<number>(0);
  const countedAyahsRef = useRef<Set<number>>(new Set());
  const currentAyahNumberRef = useRef<number>(currentAyahNumber);
  currentAyahNumberRef.current = currentAyahNumber;
  const translationCacheRef = useRef<Map<string, string[]>>(new Map()); // `${surah}:${edition}`
  // Mirrors, so the per-row toggle can stay reference-stable and keep AyahRow memoized.
  const currentSurahRef = useRef<SurahDetail | null>(currentSurah);
  currentSurahRef.current = currentSurah;
  const learnedRef = useRef<LearnedMap>(learned);
  learnedRef.current = learned;

  // --- Progress ---

  // One mutation behind all three entry points: single verse, selection, whole surah.
  const setVersesLearned = useCallback((surahNumber: number, verseNumbers: number[], value: boolean) => {
    setLearned(prev => {
      const set = new Set(prev[surahNumber] ?? []);
      verseNumbers.forEach(n => value ? set.add(n) : set.delete(n));
      const next = { ...prev };
      if (set.size === 0) delete next[surahNumber]; // do not keep empty entries around
      else next[surahNumber] = [...set].sort((a, b) => a - b);
      return next;
    });
  }, []);

  // A Set for the open surah - `includes` per row would be 286² comparisons in Al-Baqara.
  const currentLearned = useMemo(
    () => new Set(currentSurah ? learned[currentSurah.number] ?? [] : []),
    [learned, currentSurah]
  );

  const totalLearned = useMemo(
    () => Object.values(learned).reduce((sum, list) => sum + list.length, 0),
    [learned]
  );

  const handleToggleLearned = useCallback((verseNumber: number) => {
    const surah = currentSurahRef.current;
    if (!surah) return;
    const alreadyLearned = (learnedRef.current[surah.number] ?? []).includes(verseNumber);
    setVersesLearned(surah.number, [verseNumber], !alreadyLearned);
  }, [setVersesLearned]);

  const toggleSurahLearned = useCallback((surahNumber: number, ayahCount: number) => {
    const complete = (learnedRef.current[surahNumber] ?? []).length >= ayahCount;
    const all = Array.from({ length: ayahCount }, (_, i) => i + 1);
    setVersesLearned(surahNumber, all, !complete);
  }, [setVersesLearned]);

  // --- Playback primitives ---

  const clearPauseTimer = useCallback(() => {
    if (pauseTimerRef.current === null) return;
    window.clearTimeout(pauseTimerRef.current);
    pauseTimerRef.current = null;
    setIsPausing(false);
  }, []);

  const schedule = useCallback((ms: number, fn: () => void) => {
    clearPauseTimer();
    if (ms <= 0) {
      fn();
      return;
    }
    setIsPausing(true);
    pauseTimerRef.current = window.setTimeout(() => {
      pauseTimerRef.current = null;
      setIsPausing(false);
      fn();
    }, ms);
  }, [clearPauseTimer]);

  const safePlay = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    playbackIntentRef.current = true;
    setIsPlaying(true);
    try {
      // Swallow the previous promise separately: swapping `src` rejects it with
      // AbortError, and letting that bubble here would skip the new play() entirely.
      if (playPromiseRef.current) {
        await playPromiseRef.current.catch(() => {});
      }
      playPromiseRef.current = audio.play();
      await playPromiseRef.current;
    } catch (error: any) {
      // AbortError only means a newer source superseded this call, so the intent survives.
      if (error?.name !== 'AbortError') {
        console.error("Playback failed:", error);
        playbackIntentRef.current = false;
        setIsPlaying(false);
      }
    } finally {
      playPromiseRef.current = null;
    }
  }, []);

  const stopPlayback = useCallback(() => {
    playbackIntentRef.current = false;
    clearPauseTimer();
    audioRef.current?.pause();
    setIsPlaying(false);
  }, [clearPauseTimer]);

  // Moves the playback cursor. When the target is the verse already loaded, changing state
  // would be a no-op and the source effect would never fire - so restart the element here.
  const goToAyah = useCallback((next: number) => {
    playbackIntentRef.current = true;
    setIsPlaying(true);
    if (next === currentAyahNumberRef.current) {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        safePlay();
      }
    } else {
      setCurrentAyahNumber(next);
    }
  }, [safePlay]);

  // --- Selection ---

  const handleActivateAyah = useCallback((number: number) => {
    playbackDrivenRef.current = false;
    playCountRef.current = 0;
    clearPauseTimer();
    setCurrentAyahNumber(number);
  }, [clearPauseTimer]);

  const {
    selection,
    setSelection,
    clearSelection,
    isDragging,
    containerProps,
    rowProps,
  } = useVerseRangeSelection({
    scrollContainerRef,
    currentNumber: currentAyahNumber,
    onActivate: handleActivateAyah,
  });

  // --- Effects ---

  // Initialize App
  useEffect(() => {
    const loadInitialData = async () => {
      setIsLoading(true);
      try {
        // The only wait in the app's life: ~265 KB gzipped, then everything is in memory.
        await loadQuranData();
        setSurahs(getSurahs());
        loadSurah(selectedSurahNumber);
      } catch (err) {
        console.error("Failed to load initial data", err);
      } finally {
        setIsLoading(false);
      }
    };
    loadInitialData();
  }, []);

  // Save basic preferences
  useEffect(() => {
    localStorage.setItem('hifz_reciter', reciter);
    localStorage.setItem('hifz_verse_repeat', JSON.stringify(verseRepeat));
    localStorage.setItem('hifz_pause_factors', JSON.stringify(pauseFactors));
    localStorage.setItem('hifz_verse_pause_factors', JSON.stringify(versePauseFactors));
    localStorage.setItem('hifz_playback_rate', JSON.stringify(playbackRate));
    localStorage.setItem('hifz_show_translation', JSON.stringify(showTranslation));
    localStorage.setItem('hifz_translation', translationEdition);
  }, [reciter, verseRepeat, pauseFactors, versePauseFactors, playbackRate, showTranslation, translationEdition]);

  // Theme: mirror the choice onto <html> so Tailwind's `dark:` variants take effect. Storage
  // is deliberately not written here - only pressing the button counts as a choice, so an app
  // that has never been switched keeps taking the OS preference afresh on every load.
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  // Arabic font: same idea, one attribute on <html>. index.html turns it into a font family,
  // a size and a leading, so switching costs a repaint and not a re-render of the verse list.
  useEffect(() => {
    document.documentElement.dataset.arabicFont = arabicFont;
    localStorage.setItem('hifz_arabic_font', arabicFont);
  }, [arabicFont]);

  // The Mushaf layout is 697 KB that the list view never needs, so it waits until the view is
  // opened for the first time rather than joining the startup load.
  useEffect(() => {
    localStorage.setItem('hifz_view', view);
    if (view !== 'mushaf' || mushafReady) return;
    let cancelled = false;
    loadMushaf()
      .then(() => {
        if (cancelled) return;
        setMushafReady(true);
        // Open on the page holding whatever is being practised, not on page 1.
        if (currentAyahNumber) setMushafPage(getPageOfAyah(currentAyahNumber));
      })
      .catch(err => {
        console.error('Failed to load the Mushaf layout', err);
        if (!cancelled) setMushafFailed(true);
      });
    return () => { cancelled = true; };
  }, [view, mushafReady, currentAyahNumber]);

  // One page's font, plus its neighbours in the background so turning does not stall.
  useEffect(() => {
    if (view !== 'mushaf' || !mushafReady) return;
    let cancelled = false;
    setPageFontReady(false);
    loadPageFont(mushafPage)
      .then(() => { if (!cancelled) setPageFontReady(true); })
      .catch(err => { console.error(`Failed to load the font for page ${mushafPage}`, err); });
    warmPageFont(mushafPage + 1);
    warmPageFont(mushafPage - 1);
    return () => { cancelled = true; };
  }, [view, mushafReady, mushafPage]);


  // Progress gets its own effect: it is the largest object we store and should not be
  // rewritten every time a stepper or the reciter changes.
  useEffect(() => {
    localStorage.setItem('hifz_learned', JSON.stringify(learned));
  }, [learned]);

  // Load the translation only while it is switched on. Cached per surah and edition, so
  // toggling off and on again or going back to an edition costs no request.
  useEffect(() => {
    setTranslationFailed(false);
    if (!showTranslation || !currentSurah) {
      setTranslations(null);
      return;
    }
    const key = `${currentSurah.number}:${translationEdition}`;
    const cached = translationCacheRef.current.get(key);
    if (cached) {
      setTranslations(cached);
      return;
    }

    let cancelled = false;
    setTranslations(null);
    fetchTranslation(currentSurah.number, translationEdition)
      .then(texts => {
        translationCacheRef.current.set(key, texts);
        // A slow response for a surah we already navigated away from must not land.
        if (!cancelled) setTranslations(texts);
      })
      .catch(err => {
        console.error("Failed to load translation", err);
        // Without this the rows would keep pulsing their loading placeholder forever.
        if (!cancelled) setTranslationFailed(true);
      });
    return () => { cancelled = true; };
  }, [showTranslation, translationEdition, currentSurah]);

  // Apply the rate live and re-apply after every source swap: the media load algorithm
  // resets playbackRate to defaultPlaybackRate, so both have to be set.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.preservesPitch = true; // keep the maqam intact when slowing down
    audio.defaultPlaybackRate = playbackRate;
    audio.playbackRate = playbackRate;
  }, [playbackRate, currentAyahNumber, currentSurah, reciter]);

  // Persist the verse range. Global numbers, so it no longer belongs to one surah.
  useEffect(() => {
    if (selection) {
      localStorage.setItem('hifz_selection', JSON.stringify(selection));
    } else {
      localStorage.removeItem('hifz_selection');
    }
  }, [selection]);

  // Keep playing across source changes
  useEffect(() => {
    if (playbackIntentRef.current) safePlay();
  }, [currentAyahNumber, currentSurah, reciter]);

  // A different reciter or speed means different listening times, so measuring starts over
  useEffect(() => {
    passDurationRef.current = 0;
    countedAyahsRef.current.clear();
    setPassSeconds(prev => (prev === 0 ? prev : 0));
    setVerseSeconds(prev => (prev === 0 ? prev : 0));
  }, [reciter, playbackRate]);

  // A changed range restarts the repeat bookkeeping and the pass measurement
  useEffect(() => {
    playCountRef.current = 0;
    passDurationRef.current = 0;
    countedAyahsRef.current.clear();
    setPassSeconds(prev => (prev === 0 ? prev : 0));
    clearPauseTimer();
  }, [selection, clearPauseTimer]);

  // Once the drag settles, pull the cursor into the new range
  useEffect(() => {
    if (isDragging || !selection) return;
    setCurrentAyahNumber(prev => (prev < selection.start || prev > selection.end) ? selection.start : prev);
  }, [isDragging, selection]);

  // Follow along while the loop runs, but never fight a drag or a manual click. The list
  // scrolls the verse into view; the Mushaf turns the page when the recitation leaves it.
  useEffect(() => {
    if (!playbackDrivenRef.current || isDragging) return;
    playbackDrivenRef.current = false;
    if (view === 'mushaf') {
      if (mushafReady) setMushafPage(prev => {
        const page = getPageOfAyah(currentAyahNumber);
        return page === prev ? prev : page;
      });
      return;
    }
    document.getElementById(`ayah-${currentAyahNumber}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [currentAyahNumber]);

  // Warm up the next verse so the loop does not stutter on the wrap-around
  useEffect(() => {
    if (!currentAyahNumber) return;
    const next = selection
      ? (currentAyahNumber < selection.end ? currentAyahNumber + 1 : selection.start)
      : Math.min(currentAyahNumber + 1, TOTAL_AYAHS);
    if (next === currentAyahNumber) return;

    const preload = new Audio(getAyahAudioUrl(next, reciter));
    preload.preload = 'auto';
    preload.load();
    return () => {
      preload.removeAttribute('src');
      preload.load();
    };
  }, [currentAyahNumber, reciter, selection]);

  // Escape closes whatever is open on top, and only then clears the range
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || showSettings) return;
      if (showPlayback) setShowPlayback(false);
      else clearSelection();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [clearSelection, showSettings, showPlayback]);

  // Never leave a pause timer running behind us
  useEffect(() => () => {
    if (pauseTimerRef.current !== null) window.clearTimeout(pauseTimerRef.current);
  }, []);

  // --- Logic ---

  // Synchronous since the text ships with the app: no spinner, no waiting between surahs.
  const loadSurah = (number: number) => {
    stopPlayback();
    try {
      const data = getSurahDetail(number);
      const first = data.ayahs[0].number;
      const last = data.ayahs[data.ayahs.length - 1].number;
      // A range is global now, so it may point at a surah other than the one being opened.
      // Keeping such a range would leave the list with nothing highlighted, so it goes.
      const stored = readStoredSelection();
      const restored = stored && stored.end >= first && stored.start <= last ? stored : null;
      const cursor = restored ? Math.max(restored.start, first) : first;
      setCurrentSurah(data);
      setSelection(restored);
      setCurrentAyahNumber(cursor);
      // Picking a surah from the sidebar should open its page, not just move the cursor.
      if (mushafReady) setMushafPage(getPageOfAyah(cursor));
    } catch (err) {
      console.error("Failed to load surah", err);
    }
  };

  const togglePlay = () => {
    if (isPlaying) {
      stopPlayback();
      return;
    }
    playCountRef.current = 0;
    passDurationRef.current = 0;
    countedAyahsRef.current.clear();
    if (selection && (currentAyahNumber < selection.start || currentAyahNumber > selection.end)) {
      goToAyah(selection.start);
    } else {
      safePlay();
    }
  };

  // The bar and the playback engine always work on a block. Without a drag selection that
  // block is simply the current verse - which is what makes the per-verse repeat, the pause
  // and the speed meaningful even when nothing is selected.
  // Declared before handleAudioEnd on purpose: its dependency array is evaluated during
  // render, so a later `const` would blow up with a ReferenceError.
  const activeRange: AyahRange | null = currentAyahNumber
    ? (selection ?? { start: currentAyahNumber, end: currentAyahNumber })
    : null;

  const handleAudioEnd = useCallback(() => {
    if (!activeRange) return;
    playbackDrivenRef.current = true;

    // How long you actually listened to this verse - divided by the rate, and the basis for
    // both pauses. Each verse contributes to the pass once, however often it repeats.
    const duration = audioRef.current?.duration;
    const heard = Number.isFinite(duration) ? (duration as number) / playbackRate : 0;
    if (heard > 0) {
      setVerseSeconds(heard);
      if (!countedAyahsRef.current.has(currentAyahNumber)) {
        countedAyahsRef.current.add(currentAyahNumber);
        passDurationRef.current += heard;
      }
    }

    // The verse pause follows every recitation of a verse - between its repeats just as much
    // as between two verses - so there is room to say back what you just heard. At a factor
    // of 0 `schedule` runs the callback straight away, which is the seamless behaviour this
    // had before the pause existed.
    const versePause = pauseSeconds(heard, versePauseFactor) * 1000;

    playCountRef.current += 1;
    if (playCountRef.current < verseRepeat) {
      schedule(versePause, () => goToAyah(currentAyahNumber));
      return;
    }
    playCountRef.current = 0;
    if (currentAyahNumber < activeRange.end) {
      schedule(versePause, () => goToAyah(currentAyahNumber + 1));
      return;
    }

    // End of the block: the pass is complete, so its length sets the pause. A block pause
    // replaces the verse pause here instead of adding to it - the last verse is followed by
    // one silence, never two. Without a block pause the verse pause still applies, so every
    // verse ends the same way. Playback always starts over - there is no "play once and
    // stop" any more.
    const passLength = passDurationRef.current;
    setPassSeconds(passLength);
    passDurationRef.current = 0;
    countedAyahsRef.current.clear();
    schedule(pauseFactor > 0 ? pauseSeconds(passLength, pauseFactor) * 1000 : versePause, () => goToAyah(activeRange.start));
  }, [activeRange, verseRepeat, pauseFactor, versePauseFactor, playbackRate, currentAyahNumber, schedule, goToAyah]);

  const handleAudioError = useCallback(() => {
    console.error("Could not load audio for the current ayah");
    stopPlayback();
  }, [stopPlayback]);

  const filteredSurahs = surahs.filter(s =>
    s.englishName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.number.toString().includes(searchTerm)
  );

  // Looked up rather than indexed into the open surah: the cursor is a global number, and in
  // the Mushaf view it may sit in a surah other than the one the sidebar has selected.
  const currentAyah = currentAyahNumber ? getAyahByNumber(currentAyahNumber)?.ayah : undefined;
  const reciterName = RECITERS.find(r => r.id === reciter)?.name ?? reciter;
  const activeCount = activeRange ? activeRange.end - activeRange.start + 1 : 0;

  // The surahs printed on the open page, for the header. Al-Baqara, or "An-Nas · Al-Falaq".
  const pageSurahs = (() => {
    if (view !== 'mushaf' || !mushafReady) return null;
    const range = getPageRange(mushafPage);
    if (!range) return null;
    const names: string[] = [];
    for (let ayah = range.start; ayah <= range.end; ayah++) {
      const found = getAyahByNumber(ayah);
      if (found && !names.includes(found.surah.englishName)) names.push(found.surah.englishName);
    }
    return names.join(' · ');
  })();

  // The surah an ayah *opens*, for the bands on a Mushaf page. Null for a verse that merely
  // continues one, which is what keeps a band from being drawn on every line.
  const surahOpenedBy = useCallback((ayah: number) => {
    const found = getAyahByNumber(ayah);
    return found && found.ayah.numberInSurah === 1 ? found.surah : null;
  }, []);

  // The open surah as global numbers, which is what bounds the step buttons. Stepping stops at
  // the surah edge as it always has; only a dragged range may cross into the next surah.
  const surahFirst = currentSurah?.ayahs[0].number ?? 0;
  const surahLast = currentSurah?.ayahs[currentSurah.ayahs.length - 1].number ?? 0;

  // "Ayah 5", "Ayah 5–12", and across a surah boundary "2:286 – 3:1". A bare verse number
  // stops being unambiguous the moment a range leaves the surah it started in.
  const rangeLabel = (() => {
    if (!activeRange) return null;
    const from = getAyahByNumber(activeRange.start);
    const to = getAyahByNumber(activeRange.end);
    if (!from || !to) return null;
    if (from.surah.number !== to.surah.number) {
      return `${from.surah.number}:${from.ayah.numberInSurah} – ${to.surah.number}:${to.ayah.numberInSurah}`;
    }
    return activeCount > 1
      ? `Ayah ${from.ayah.numberInSurah}–${to.ayah.numberInSurah}`
      : `Ayah ${from.ayah.numberInSurah}`;
  })();

  // --- Render ---

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden font-sans">
      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 dark:bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md max-h-[90vh] flex flex-col rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="shrink-0 p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
              <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Settings className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                App Settings
              </h2>
              <button onClick={() => setShowSettings(false)} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors">
                <X className="w-5 h-5 text-slate-500 dark:text-slate-400" />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-6">
              <div className="space-y-3">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                  <Volume2 className="w-4 h-4" />
                  Preferred Reciter
                </label>
                <div className="grid grid-cols-1 gap-2">
                  {RECITERS.map((r) => {
                    const factor = clampFactor(pauseFactors[r.id] ?? 0);
                    const verseFactor = clampFactor(versePauseFactors[r.id] ?? 0);
                    return (
                      <button
                        key={r.id}
                        onClick={() => setReciter(r.id)}
                        className={`flex items-center justify-between p-4 rounded-xl border-2 transition-all ${
                          reciter === r.id
                            ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-200'
                            : 'border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        <span className="font-medium">{r.name}</span>
                        <span className="flex items-center gap-3">
                          {(factor > 0 || verseFactor > 0) && (
                            <span
                              className="text-xs font-semibold text-slate-400 tabular-nums"
                              title="Saved pause factors: after each verse / after the block"
                            >
                              {verseFactor}× / {factor}× pause
                            </span>
                          )}
                          {reciter === r.id && <CheckCircle2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
                <div className="flex items-center justify-between p-2">
                  <div className="flex flex-col pr-4">
                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">Show Translation</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">Displays an English translation under each verse</span>
                  </div>
                  <button
                    onClick={() => setShowTranslation(!showTranslation)}
                    className={`relative w-12 h-6 rounded-full transition-colors shrink-0 ${showTranslation ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-slate-700'}`}
                  >
                    <div className={`absolute top-1 left-1 w-4 h-4 bg-white dark:bg-slate-900 rounded-full transition-transform ${showTranslation ? 'translate-x-6' : ''}`} />
                  </button>
                </div>

                {showTranslation && (
                  <div className="grid grid-cols-1 gap-2">
                    {TRANSLATIONS.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setTranslationEdition(t.id)}
                        className={`flex items-center justify-between p-4 rounded-xl border-2 transition-all text-left ${
                          translationEdition === t.id
                            ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-200'
                            : 'border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        <span className="flex flex-col">
                          <span className="font-medium">{t.name}</span>
                          <span className="text-xs text-slate-400">{t.author}</span>
                        </span>
                        {translationEdition === t.id && <CheckCircle2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0" />}
                      </button>
                    ))}
                    {translationFailed && (
                      <p className="px-2 pt-1 text-xs text-rose-600 dark:text-rose-400">
                        This translation could not be loaded. Pick another one or check your connection.
                      </p>
                    )}
                    <p className="px-2 pt-1 text-xs text-slate-400">Bundled with the app, from alquran.cloud</p>
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                  <Type className="w-4 h-4" />
                  Arabic Font
                </label>
                <p className="px-2 -mt-1 text-xs text-slate-400">
                  For the verse list. The Mushaf view brings its own type, one font per page.
                </p>
                <div className="grid grid-cols-1 gap-2">
                  {ARABIC_FONTS.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setArabicFont(f.id)}
                      className={`flex items-center justify-between gap-3 p-4 rounded-xl border-2 transition-all text-left ${
                        arabicFont === f.id
                          ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-200'
                          : 'border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      <span className="flex flex-col min-w-0">
                        <span className="font-medium">{f.name}</span>
                        <span className="text-xs text-slate-400">{f.note}</span>
                      </span>
                      <span className="flex items-center gap-3 shrink-0">
                        {/* You pick a font by how it looks, not by its name. */}
                        <span
                          data-font-sample={f.id}
                          dir="rtl"
                          aria-hidden="true"
                          className="font-arabic-sample text-slate-700 dark:text-slate-200"
                        >
                          {BASMALA}
                        </span>
                        {arabicFont === f.id && <CheckCircle2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <p className="pt-4 border-t border-slate-100 dark:border-slate-800 px-2 text-xs text-slate-400">
                Tip: drag across the verses to select a range — on touch, hold a verse first.
                Without a selection the controls apply to the current verse.
              </p>
            </div>

            <div className="shrink-0 p-6 bg-slate-50 dark:bg-slate-950 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => {
                  setShowSettings(false);
                  if (currentSurah) loadSurah(currentSurah.number);
                }}
                className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl shadow-lg shadow-indigo-100 dark:shadow-none hover:bg-indigo-700 active:scale-[0.98] transition-all"
              >
                Save & Apply Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar - Surah List */}
      <aside className={`bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-700 transition-all duration-300 flex flex-col ${showSidebar ? 'w-80' : 'w-0 overflow-hidden border-none'}`}>
        {/* No heading above the list: the search field already names what the column holds.
            The collapse button and the progress hairline moved in here when it went - they
            were the only other things the heading row carried. */}
        <div className="p-4 bg-white dark:bg-slate-900 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search Surah..."
                className="w-full pl-10 pr-4 py-2 bg-slate-100 dark:bg-slate-800 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 transition-all"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <button onClick={() => setShowSidebar(false)} className="lg:hidden shrink-0 p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg">
              <ChevronLeft className="w-5 h-5" />
            </button>
          </div>

          {/* The exact count lives in the tooltip rather than a line of its own. */}
          {totalLearned > 0 && (
            <div
              className="flex items-center gap-2"
              title={`${totalLearned} of ${TOTAL_AYAHS} verses learned`}
            >
              <div className="flex-1 h-0.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full"
                  style={{ width: `${Math.min(100, (totalLearned / TOTAL_AYAHS) * 100)}%` }}
                />
              </div>
              <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums shrink-0">
                {((totalLearned / TOTAL_AYAHS) * 100).toFixed(1)}%
              </span>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredSurahs.map((surah) => {
            const isActive = selectedSurahNumber === surah.number;
            const learnedCount = learned[surah.number]?.length ?? 0;
            const isComplete = learnedCount >= surah.numberOfAyahs;
            return (
              // A div with two sibling buttons: a button inside a button would be invalid.
              <div
                key={surah.number}
                className={`relative flex items-stretch rounded-xl overflow-hidden transition-all ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200 dark:shadow-none'
                    : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'
                }`}
              >
                <button
                  onClick={() => {
                    setSelectedSurahNumber(surah.number);
                    loadSurah(surah.number);
                  }}
                  className="flex-1 min-w-0 flex items-center justify-between gap-2 p-3 text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full shrink-0 ${
                      isActive ? 'bg-indigo-500' : 'bg-slate-200 dark:bg-slate-700'
                    }`}>
                      {surah.number}
                    </span>
                    <div className="min-w-0">
                      <div className="font-semibold text-sm truncate">{surah.englishName}</div>
                      <div className={`text-[10px] uppercase tracking-wider truncate ${
                        isActive ? 'text-indigo-100' : 'text-slate-400'
                      }`}>
                        {surah.revelationType} • {learnedCount > 0 ? `${learnedCount}/` : ''}{surah.numberOfAyahs}
                      </div>
                    </div>
                  </div>
                  <div className="font-quran text-lg shrink-0">{surah.name}</div>
                </button>

                <button
                  onClick={() => toggleSurahLearned(surah.number, surah.numberOfAyahs)}
                  aria-pressed={isComplete}
                  title={isComplete ? `Unmark all ${surah.numberOfAyahs} verses` : `Mark all ${surah.numberOfAyahs} verses as learned`}
                  className={`shrink-0 pl-1 pr-2.5 flex items-center transition-colors ${
                    isComplete
                      ? (isActive ? 'text-emerald-300' : 'text-emerald-600 dark:text-emerald-400')
                      : learnedCount > 0
                        ? (isActive ? 'text-emerald-200/70' : 'text-emerald-400/70')
                        : (isActive ? 'text-white/40 hover:text-white' : 'text-slate-300 dark:text-slate-500 hover:text-emerald-500')
                  }`}
                >
                  <CheckCircle2 className="w-5 h-5" />
                </button>

                {/* Hairline progress. Only drawn once there is progress, so untouched
                    surahs are not lined with an empty gutter. */}
                {learnedCount > 0 && (
                  <div className={`absolute bottom-0 left-0 right-0 h-0.5 ${isActive ? 'bg-white/25' : 'bg-slate-200 dark:bg-slate-700'}`}>
                    <div
                      className={`h-full ${isActive ? 'bg-emerald-300' : 'bg-emerald-500'}`}
                      style={{ width: `${Math.min(100, (learnedCount / surah.numberOfAyahs) * 100)}%` }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col relative overflow-hidden">
        {/* Header */}
        <header className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-700 p-4 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-4">
            <button onClick={() => setShowSidebar(!showSidebar)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-300">
              <List className="w-5 h-5" />
            </button>
            {view === 'mushaf' ? (
              // A page carries whatever surahs happen to fall on it, which is rarely the one
              // the sidebar has selected.
              pageSurahs && (
                <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">
                  {pageSurahs}
                </h1>
              )
            ) : currentSurah && (
              <div>
                <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  {currentSurah.englishName}
                  <span className="text-sm font-normal text-slate-400">({currentSurah.englishNameTranslation})</span>
                </h1>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setView(v => (v === 'list' ? 'mushaf' : 'list'))}
              title={view === 'list' ? 'Mushaf page view' : 'Verse list'}
              className="p-2 text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 rounded-full transition-all"
            >
              {view === 'list' ? <BookMarked className="w-5 h-5" /> : <Rows3 className="w-5 h-5" />}
            </button>
            <button
              onClick={() => {
                const next = OTHER_THEME[theme];
                setTheme(next);
                localStorage.setItem('hifz_theme', next);
              }}
              title={`Theme: ${THEME_LABEL[theme]} (click for ${THEME_LABEL[OTHER_THEME[theme]]})`}
              className="p-2 text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 rounded-full transition-all"
            >
              {React.createElement(THEME_ICON[theme], { className: 'w-5 h-5' })}
            </button>
            <button
              onClick={() => setShowSettings(true)}
              title="Settings"
              className="p-2 text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 rounded-full transition-all group"
            >
              <Settings className="w-5 h-5 group-hover:rotate-45 transition-transform duration-300" />
            </button>
          </div>
        </header>

        {/* Content Section */}
        <div
          ref={scrollContainerRef}
          {...containerProps}
          style={{ touchAction: isDragging ? 'none' : undefined }}
          className="flex-1 overflow-y-auto px-4 py-8 max-w-5xl mx-auto w-full"
        >
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
            </div>
          ) : view === 'mushaf' ? (
            <div className="pb-12">
              {mushafFailed ? (
                <p className="text-center py-20 text-sm text-rose-600 dark:text-rose-400">
                  The Mushaf layout could not be loaded. The page fonts come off a CDN, so this
                  view needs a connection.
                </p>
              ) : !mushafReady ? (
                <div className="flex items-center justify-center h-64">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600" />
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-center gap-4 mb-6">
                    <button
                      onClick={() => setMushafPage(p => Math.min(MUSHAF_PAGES, p + 1))}
                      disabled={mushafPage >= MUSHAF_PAGES}
                      title="Next page"
                      className="p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full disabled:opacity-30"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <span className="text-sm font-semibold text-slate-600 dark:text-slate-300 tabular-nums">
                      Page {mushafPage} of {MUSHAF_PAGES}
                    </span>
                    {/* Right arrow steps back: the Mushaf is bound on the right, so the earlier
                        page lies that way. */}
                    <button
                      onClick={() => setMushafPage(p => Math.max(1, p - 1))}
                      disabled={mushafPage <= 1}
                      title="Previous page"
                      className="p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full disabled:opacity-30"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>
                  <MushafPage
                    page={mushafPage}
                    lines={getMushafPage(mushafPage)}
                    fontReady={pageFontReady}
                    selection={selection}
                    currentAyahNumber={currentAyahNumber}
                    basmala={BASMALA}
                    surahOf={surahOpenedBy}
                    {...rowProps}
                  />
                </>
              )}
            </div>
          ) : currentSurah ? (
            <div className="space-y-12 pb-12">
              {currentSurah.number !== 1 && currentSurah.number !== 9 && (
                <div className="text-center">
                  <div className="font-arabic-display font-arabic-lg text-slate-700 dark:text-slate-200 mb-8">
                    {BASMALA}
                  </div>
                </div>
              )}

              <div
                role="listbox"
                aria-multiselectable="true"
                aria-label="Verses"
                // Always select-none: a drag starting in the gap between two cards never
                // reaches a row's pointerdown, so nothing would suppress native text
                // selection and the drag would highlight text instead of picking verses.
                className={`space-y-8 select-none ${isDragging ? 'cursor-ns-resize' : ''}`}
              >
                {currentSurah.ayahs.map((ayah, idx) => {
                  const isCurrent = currentAyahNumber === ayah.number;
                  const isSelected = !!selection && ayah.number >= selection.start && ayah.number <= selection.end;
                  return (
                    <AyahRow
                      key={ayah.number}
                      ayah={ayah}
                      isCurrent={isCurrent}
                      isSelected={isSelected}
                      isRangeStart={!!selection && ayah.number === selection.start}
                      isRangeEnd={!!selection && ayah.number === selection.end}
                      isLearned={currentLearned.has(ayah.numberInSurah)}
                      showTranslation={showTranslation && !translationFailed}
                      translation={translations?.[idx] ?? null}
                      onToggleLearned={handleToggleLearned}
                      {...rowProps}
                    />
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="text-center py-20">
              <BookOpen className="w-16 h-16 text-slate-200 dark:text-slate-700 mx-auto mb-4" />
              <p className="text-slate-400">Select a Surah to begin your Hifz journey</p>
            </div>
          )}
        </div>

        {/* Catches the click that closes the playback panel. Sits below the player (z-50) so
            the panel's own controls stay reachable. */}
        {showPlayback && (
          <div className="fixed inset-0 z-40" onClick={() => setShowPlayback(false)} />
        )}

        {/* Player controls - the bottom edge of the layout, mirroring the header: a row of
            its own that the verses are laid out around, not a card floating over them. */}
        <div className="relative z-50 shrink-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-t border-slate-200 dark:border-slate-700">
          <div className="relative max-w-3xl mx-auto px-4">
            {/* Playback panel - floats above the bar so the verses stay visible while you
                adjust something mid-recitation. */}
            {showPlayback && (
              <div className="absolute bottom-full right-0 mb-3 w-[min(22rem,calc(100vw-2rem))] bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
                  <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                    <SlidersHorizontal className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    Playback
                  </h2>
                  <button
                    onClick={() => setShowPlayback(false)}
                    className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors"
                  >
                    <X className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                  </button>
                </div>

                {/* Capped and scrollable: the panel opens upwards inside <main>, which clips
                    its overflow, so on a short window it has to fit rather than run off. */}
                <div className="p-4 space-y-4 max-h-[min(26rem,60vh)] overflow-y-auto">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">Speed</div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Pitch stays intact</p>
                    </div>
                    <Stepper
                      title="How fast the recitation is played back"
                      value={`${playbackRate}×`}
                      canDecrease={playbackRate > MIN_PLAYBACK_RATE}
                      canIncrease={playbackRate < MAX_PLAYBACK_RATE}
                      onDecrease={() => setPlaybackRate(v => Math.max(MIN_PLAYBACK_RATE, Math.round((v - PLAYBACK_RATE_STEP) * 100) / 100))}
                      onIncrease={() => setPlaybackRate(v => Math.min(MAX_PLAYBACK_RATE, Math.round((v + PLAYBACK_RATE_STEP) * 100) / 100))}
                    />
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">Repeats per verse</div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Before moving on</p>
                    </div>
                    <Stepper
                      title="How often each verse repeats before moving on"
                      value={`${verseRepeat}×`}
                      canDecrease={verseRepeat > 1}
                      canIncrease={verseRepeat < MAX_VERSE_REPEAT}
                      onDecrease={() => setVerseRepeat(v => Math.max(1, v - 1))}
                      onIncrease={() => setVerseRepeat(v => Math.min(MAX_VERSE_REPEAT, v + 1))}
                    />
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">Pause after each verse</div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {/* Inert only when every verse end is also a block end - one verse,
                            played once - and a block pause is set to take those ends over. */}
                        {activeCount < 2 && verseRepeat < 2 && pauseFactor > 0
                          ? 'The block pause covers it'
                          : verseSeconds > 0
                            ? versePauseFactor > 0
                              ? `≈ ${Math.round(pauseSeconds(verseSeconds, versePauseFactor))}s, repeats included`
                              : 'Straight on to the next one'
                            : 'Also between repeats of a verse'}
                      </p>
                    </div>
                    <Stepper
                      title={`Silence after every recitation of a verse - between its repeats as well as between verses - as a multiple of how long that verse takes${
                        verseSeconds > 0 ? ` (last one ≈ ${Math.round(verseSeconds)}s)` : ''
                      }`}
                      value={`${versePauseFactor}×`}
                      canDecrease={versePauseFactor > 0}
                      canIncrease={versePauseFactor < MAX_PAUSE_FACTOR}
                      onDecrease={() => setVersePauseFactor(v => Math.round((v - PAUSE_FACTOR_STEP) * 100) / 100)}
                      onIncrease={() => setVersePauseFactor(v => Math.round((v + PAUSE_FACTOR_STEP) * 100) / 100)}
                    />
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">Pause after the block</div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {/* The factor multiplies the measured pass, so the concrete number only
                            exists once a full pass has been heard. */}
                        {passSeconds > 0
                          ? pauseFactor > 0
                            ? `≈ ${Math.round(pauseSeconds(passSeconds, pauseFactor))}s before it starts over`
                            : versePauseFactor > 0
                              ? 'The verse pause applies instead'
                              : 'Straight back to the start'
                          : 'A multiple of how long one pass takes'}
                      </p>
                    </div>
                    <Stepper
                      title={`Silence before the block starts over, as a multiple of how long one pass takes${
                        passSeconds > 0 ? ` (one pass ≈ ${Math.round(passSeconds)}s)` : ''
                      }`}
                      value={`${pauseFactor}×`}
                      canDecrease={pauseFactor > 0}
                      canIncrease={pauseFactor < MAX_PAUSE_FACTOR}
                      onDecrease={() => setPauseFactor(v => Math.round((v - PAUSE_FACTOR_STEP) * 100) / 100)}
                      onIncrease={() => setPauseFactor(v => Math.round((v + PAUSE_FACTOR_STEP) * 100) / 100)}
                    />
                  </div>

                  <p className="pt-1 text-xs text-slate-400 border-t border-slate-100 dark:border-slate-800">
                    Both pauses are saved for {reciterName} — reciters differ in tempo.
                  </p>
                </div>
              </div>
            )}

            <div className="py-3">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-indigo-600 text-white rounded-xl flex items-center justify-center font-bold text-lg shadow-lg shadow-indigo-200 dark:shadow-none">
                    {currentAyah ? currentAyah.numberInSurah : '--'}
                  </div>
                  <div>
                    <div className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate max-w-[150px] md:max-w-none">
                      {isPausing
                        ? 'Pausing…'
                        : currentAyah
                          ? `Ayah ${currentAyah.numberInSurah} of ${currentSurah?.numberOfAyahs}`
                          : 'Pick an Ayah'}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 font-medium truncate max-w-[150px] md:max-w-none">
                      {currentSurah?.englishName || 'No Surah Selected'}
                      {/* Only a drag selection is worth naming: without one the block is the
                          single verse the line above already names. */}
                      {selection && rangeLabel && ` · ${rangeLabel}`}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 md:gap-4">
                  {/* Only a real drag selection can be cleared. */}
                  {selection && (
                    <button
                      onClick={clearSelection}
                      title="Clear selection"
                      className="p-2.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  )}

                  <button
                    onClick={() => setShowPlayback(v => !v)}
                    aria-expanded={showPlayback}
                    title="Speed, repeats and pause"
                    className={`p-2.5 rounded-full transition-colors ${
                      showPlayback
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <SlidersHorizontal className="w-5 h-5" />
                  </button>

                  <button
                    onClick={() => handleActivateAyah(Math.max(surahFirst, currentAyahNumber - 1))}
                    disabled={!currentSurah || currentAyahNumber <= surahFirst}
                    className="p-2.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full disabled:opacity-30 disabled:hover:bg-transparent"
                  >
                    <ChevronLeft className="w-6 h-6" />
                  </button>

                  <button
                    onClick={togglePlay}
                    className="w-12 h-12 md:w-14 md:h-14 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full flex items-center justify-center shadow-lg hover:shadow-indigo-200 dark:hover:shadow-none active:scale-95 transition-all"
                  >
                    {isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current ml-1" />}
                  </button>

                  <button
                    onClick={() => handleActivateAyah(Math.min(surahLast, currentAyahNumber + 1))}
                    disabled={!currentSurah || currentAyahNumber >= surahLast}
                    className="p-2.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full disabled:opacity-30 disabled:hover:bg-transparent"
                  >
                    <ChevronRight className="w-6 h-6" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Hidden Audio Element */}
        {currentAyah && (
          <audio
            ref={audioRef}
            src={getAyahAudioUrl(currentAyahNumber, reciter)}
            onEnded={handleAudioEnd}
            onError={handleAudioError}
          />
        )}
      </main>
    </div>
  );
};

export default App;
