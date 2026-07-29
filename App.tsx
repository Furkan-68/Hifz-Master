
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Surah, SurahDetail, AyahRange } from './types';
import { loadQuranData, getSurahs, getSurahDetail, fetchTranslation, getAyahAudioUrl } from './services/quranApi';
import AyahRow from './components/AyahRow';
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
  ListChecks,
  CheckCircle2,
  Monitor,
  Sun,
  Moon,
  SlidersHorizontal
} from 'lucide-react';

type Theme = 'system' | 'light' | 'dark';

// One control, three states - so the button cycles rather than toggles.
const NEXT_THEME: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' };
const THEME_ICON: Record<Theme, typeof Monitor> = { system: Monitor, light: Sun, dark: Moon };
const THEME_LABEL: Record<Theme, string> = { system: 'System', light: 'Light', dark: 'Dark' };

const MAX_VERSE_REPEAT = 10;
// The pause is a multiple of how long one pass through the selection takes, so it scales
// with the material instead of being a fixed number of seconds.
const MAX_PAUSE_FACTOR = 3;
const PAUSE_FACTOR_STEP = 0.25;

const TOTAL_VERSES = 6236;

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

// Reciters differ in tempo, so the factor that leaves you enough time to recite along is
// a per-reciter preference rather than a global one.
const readPauseFactors = (): PauseFactors => {
  try {
    const raw = localStorage.getItem('hifz_pause_factors');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed as PauseFactors;
    }
    // Carry over the value from when one factor was shared by all reciters.
    const legacy = clampFactor(Number(localStorage.getItem('hifz_pause_factor')));
    if (legacy > 0) {
      return { [localStorage.getItem('hifz_reciter') || 'ar.alafasy']: legacy };
    }
  } catch {
    /* fall through to an empty map */
  }
  return {};
};

// A verse range is stored for one surah at a time.
const readStoredSelection = (surahNumber: number, ayahCount: number): AyahRange | null => {
  try {
    const raw = localStorage.getItem('hifz_selection');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.surah !== surahNumber) return null;
    const start = Math.max(0, Math.min(Number(parsed.start), ayahCount - 1));
    const end = Math.max(start, Math.min(Number(parsed.end), ayahCount - 1));
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
  const [currentAyahIndex, setCurrentAyahIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isPausing, setIsPausing] = useState<boolean>(false);
  const [verseRepeat, setVerseRepeat] = useState<number>(() => {
    const saved = Number(localStorage.getItem('hifz_verse_repeat'));
    return saved >= 1 && saved <= MAX_VERSE_REPEAT ? saved : 1;
  });
  const [pauseFactors, setPauseFactors] = useState<PauseFactors>(readPauseFactors);
  const [playbackRate, setPlaybackRate] = useState<number>(() => {
    const saved = Number(localStorage.getItem('hifz_playback_rate'));
    return saved >= MIN_PLAYBACK_RATE && saved <= MAX_PLAYBACK_RATE ? saved : 1;
  });
  // Length of one pass through the selection, measured while it plays.
  const [passSeconds, setPassSeconds] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [reciter, setReciter] = useState<string>(() => {
    return localStorage.getItem('hifz_reciter') || 'ar.alafasy';
  });
  const [showSidebar, setShowSidebar] = useState<boolean>(true);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [showPlayback, setShowPlayback] = useState<boolean>(false);
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem('hifz_theme') as Theme) || 'system'
  );
  const [showTranslation, setShowTranslation] = useState<boolean>(() => {
    const saved = localStorage.getItem('hifz_show_translation');
    return saved !== null ? JSON.parse(saved) : false;
  });
  const [translationEdition, setTranslationEdition] = useState<string>(() => {
    return localStorage.getItem('hifz_translation') || 'en.itani';
  });
  // Kept parallel to currentSurah.ayahs rather than merged into them, so the fetched API
  // objects stay untouched and caching per edition stays trivial.
  const [translations, setTranslations] = useState<string[] | null>(null);
  const [translationFailed, setTranslationFailed] = useState<boolean>(false);
  const [learned, setLearned] = useState<LearnedMap>(readLearned);

  // The pause factor belongs to the reciter you are listening to.
  const pauseFactor = clampFactor(pauseFactors[reciter] ?? 0);
  // Functional update, so rapid clicks batched into one render still all count.
  const setPauseFactor = useCallback((update: (prev: number) => number) => {
    setPauseFactors(prev => ({
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
  const countedIndicesRef = useRef<Set<number>>(new Set());
  const currentAyahIndexRef = useRef<number>(currentAyahIndex);
  currentAyahIndexRef.current = currentAyahIndex;
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
    if (next === currentAyahIndexRef.current) {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        safePlay();
      }
    } else {
      setCurrentAyahIndex(next);
    }
  }, [safePlay]);

  // --- Selection ---

  const handleActivateAyah = useCallback((index: number) => {
    playbackDrivenRef.current = false;
    playCountRef.current = 0;
    clearPauseTimer();
    setCurrentAyahIndex(index);
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
    currentIndex: currentAyahIndex,
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
    localStorage.setItem('hifz_playback_rate', JSON.stringify(playbackRate));
    localStorage.setItem('hifz_show_translation', JSON.stringify(showTranslation));
    localStorage.setItem('hifz_translation', translationEdition);
  }, [reciter, verseRepeat, pauseFactors, playbackRate, showTranslation, translationEdition]);

  // Theme: mirror the choice onto <html> so Tailwind's `dark:` variants take effect.
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => document.documentElement.classList.toggle(
      'dark', theme === 'dark' || (theme === 'system' && mq.matches)
    );
    apply();
    localStorage.setItem('hifz_theme', theme);
    if (theme !== 'system') return; // only while following the system must the OS reach us
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);

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
  }, [playbackRate, currentAyahIndex, currentSurah, reciter]);

  // Persist the verse range for the surah it belongs to
  useEffect(() => {
    if (!currentSurah) return;
    if (selection) {
      localStorage.setItem('hifz_selection', JSON.stringify({ surah: currentSurah.number, ...selection }));
    } else {
      localStorage.removeItem('hifz_selection');
    }
  }, [selection, currentSurah]);

  // Keep playing across source changes
  useEffect(() => {
    if (playbackIntentRef.current) safePlay();
  }, [currentAyahIndex, currentSurah, reciter]);

  // A different reciter or speed means different listening times, so measuring starts over
  useEffect(() => {
    passDurationRef.current = 0;
    countedIndicesRef.current.clear();
    setPassSeconds(prev => (prev === 0 ? prev : 0));
  }, [reciter, playbackRate]);

  // A changed range restarts the repeat bookkeeping and the pass measurement
  useEffect(() => {
    playCountRef.current = 0;
    passDurationRef.current = 0;
    countedIndicesRef.current.clear();
    setPassSeconds(prev => (prev === 0 ? prev : 0));
    clearPauseTimer();
  }, [selection, clearPauseTimer]);

  // Once the drag settles, pull the cursor into the new range
  useEffect(() => {
    if (isDragging || !selection) return;
    setCurrentAyahIndex(prev => (prev < selection.start || prev > selection.end) ? selection.start : prev);
  }, [isDragging, selection]);

  // Follow along while the loop runs, but never fight a drag or a manual click
  useEffect(() => {
    if (!playbackDrivenRef.current || isDragging) return;
    playbackDrivenRef.current = false;
    document.getElementById(`ayah-${currentAyahIndex}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [currentAyahIndex]);

  // Warm up the next verse so the loop does not stutter on the wrap-around
  useEffect(() => {
    if (!currentSurah) return;
    const ayahs = currentSurah.ayahs;
    const nextIndex = selection
      ? (currentAyahIndex < selection.end ? currentAyahIndex + 1 : selection.start)
      : Math.min(currentAyahIndex + 1, ayahs.length - 1);
    if (nextIndex === currentAyahIndex || !ayahs[nextIndex]) return;

    const preload = new Audio(getAyahAudioUrl(ayahs[nextIndex].number, reciter));
    preload.preload = 'auto';
    preload.load();
    return () => {
      preload.removeAttribute('src');
      preload.load();
    };
  }, [currentAyahIndex, currentSurah, reciter, selection]);

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
      const restored = readStoredSelection(number, data.ayahs.length);
      setCurrentSurah(data);
      setSelection(restored);
      setCurrentAyahIndex(restored ? restored.start : 0);
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
    countedIndicesRef.current.clear();
    if (selection && (currentAyahIndex < selection.start || currentAyahIndex > selection.end)) {
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
  const activeRange: AyahRange | null = currentSurah
    ? (selection ?? { start: currentAyahIndex, end: currentAyahIndex })
    : null;

  const handleAudioEnd = useCallback(() => {
    if (!currentSurah || !activeRange) return;
    playbackDrivenRef.current = true;

    // Measure the pass: each verse contributes once, however often it repeats. Divided by
    // the rate, because that is how long you actually listened to it.
    const duration = audioRef.current?.duration;
    if (Number.isFinite(duration) && !countedIndicesRef.current.has(currentAyahIndex)) {
      countedIndicesRef.current.add(currentAyahIndex);
      passDurationRef.current += (duration as number) / playbackRate;
    }

    playCountRef.current += 1;
    if (playCountRef.current < verseRepeat) {
      goToAyah(currentAyahIndex); // repeats of the same verse run back to back
      return;
    }
    playCountRef.current = 0;
    if (currentAyahIndex < activeRange.end) {
      goToAyah(currentAyahIndex + 1);
      return;
    }

    // End of the block: the pass is complete, so its length sets the pause. Playback always
    // starts over - there is no "play once and stop" any more.
    const passLength = passDurationRef.current;
    setPassSeconds(passLength);
    passDurationRef.current = 0;
    countedIndicesRef.current.clear();
    schedule(passLength * pauseFactor * 1000, () => goToAyah(activeRange.start));
  }, [activeRange, verseRepeat, pauseFactor, playbackRate, currentAyahIndex, currentSurah, schedule, goToAyah]);

  const handleAudioError = useCallback(() => {
    console.error("Could not load audio for the current ayah");
    stopPlayback();
  }, [stopPlayback]);

  const filteredSurahs = surahs.filter(s =>
    s.englishName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.number.toString().includes(searchTerm)
  );

  const currentAyah = currentSurah?.ayahs[currentAyahIndex];
  const reciterName = RECITERS.find(r => r.id === reciter)?.name ?? reciter;
  const activeCount = activeRange ? activeRange.end - activeRange.start + 1 : 0;

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
                          {factor > 0 && (
                            <span className="text-xs font-semibold text-slate-400 tabular-nums" title="Saved pause factor">
                              {factor}× pause
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
        {/* Column so the progress hairline can span the full sidebar width - the title block
            next to the collapse button is only as wide as its content. */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-col gap-2 bg-slate-50/50 dark:bg-slate-800/50">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-bold text-lg flex items-center gap-2 text-indigo-900 dark:text-indigo-200">
                <BookOpen className="w-5 h-5" />
                Surahs
              </h2>
              {totalLearned > 0 && (
                <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium mt-0.5">
                  {totalLearned} of {TOTAL_VERSES} verses learned
                </p>
              )}
            </div>
            <button onClick={() => setShowSidebar(false)} className="lg:hidden p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg">
              <ChevronLeft className="w-5 h-5" />
            </button>
          </div>

          {totalLearned > 0 && (
            <div className="flex items-center gap-2">
              <div className="flex-1 h-0.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full"
                  style={{ width: `${Math.min(100, (totalLearned / TOTAL_VERSES) * 100)}%` }}
                />
              </div>
              <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums shrink-0">
                {((totalLearned / TOTAL_VERSES) * 100).toFixed(1)}%
              </span>
            </div>
          )}
        </div>

        <div className="p-4 bg-white dark:bg-slate-900">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search Surah..."
              className="w-full pl-10 pr-4 py-2 bg-slate-100 dark:bg-slate-800 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
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
            {currentSurah && (
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
              onClick={() => setTheme(NEXT_THEME[theme])}
              title={`Theme: ${THEME_LABEL[theme]} (click for ${THEME_LABEL[NEXT_THEME[theme]]})`}
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
          ) : currentSurah ? (
            <div className="space-y-12 pb-48">
              {currentSurah.number !== 1 && currentSurah.number !== 9 && (
                <div className="text-center">
                  <div className="font-arabic-display text-4xl text-slate-700 dark:text-slate-200 leading-relaxed mb-8">
                    بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
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
                  const isCurrent = currentAyahIndex === idx;
                  const isSelected = !!selection && idx >= selection.start && idx <= selection.end;
                  return (
                    <AyahRow
                      key={ayah.number}
                      ayah={ayah}
                      index={idx}
                      isCurrent={isCurrent}
                      isSelected={isSelected}
                      isRangeStart={!!selection && idx === selection.start}
                      isRangeEnd={!!selection && idx === selection.end}
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

        {/* Floating Player Controls */}
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-transparent pointer-events-none z-50">
          <div className="relative max-w-3xl mx-auto pointer-events-auto">
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

                <div className="p-4 space-y-4">
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
                      <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">Pause</div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {/* The factor multiplies the measured pass, so the concrete number only
                            exists once a full pass has been heard. */}
                        {passSeconds > 0
                          ? pauseFactor > 0
                            ? `≈ ${Math.round(passSeconds * pauseFactor)}s before the block starts over`
                            : 'No pause before the block starts over'
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
                    Pause is saved for {reciterName} — reciters differ in tempo.
                  </p>
                </div>
              </div>
            )}

            <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border border-slate-200 dark:border-slate-700 shadow-2xl rounded-2xl p-4 md:p-6 flex flex-col gap-4">
              {/* Practice bar - always visible; without a drag selection it targets the
                  current verse. */}
              {currentSurah && activeRange && (
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <ListChecks className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                    <span className="text-sm font-bold text-indigo-900 dark:text-indigo-200">
                      Ayah {currentSurah.ayahs[activeRange.start].numberInSurah}
                      {activeCount > 1 && `–${currentSurah.ayahs[activeRange.end].numberInSurah}`}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {activeCount} {activeCount === 1 ? 'verse' : 'verses'}
                      {passSeconds > 0 && ` · ${Math.round(passSeconds)}s`}
                    </span>
                  </div>

                  {/* Only a real drag selection can be cleared. */}
                  {selection && (
                    <button
                      onClick={clearSelection}
                      title="Clear selection"
                      className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )}

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
                    <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                      {currentSurah?.englishName || 'No Surah Selected'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 md:gap-4">
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
                    onClick={() => handleActivateAyah(Math.max(0, currentAyahIndex - 1))}
                    disabled={currentAyahIndex === 0}
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
                    onClick={() => currentSurah && handleActivateAyah(Math.min(currentSurah.ayahs.length - 1, currentAyahIndex + 1))}
                    disabled={!currentSurah || currentAyahIndex === currentSurah.ayahs.length - 1}
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
            src={getAyahAudioUrl(currentAyah.number, reciter)}
            onEnded={handleAudioEnd}
            onError={handleAudioError}
          />
        )}
      </main>
    </div>
  );
};

export default App;
