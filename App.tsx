
import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { Surah, Ayah, SurahDetail, Reciter } from './types';
import { fetchSurahs, fetchSurahDetail, fetchReciters, getAyahAudioUrl } from './services/quranApi';
import { getHifzTips } from './services/geminiService';
import { 
  Play, 
  Pause, 
  Repeat, 
  ChevronLeft, 
  ChevronRight, 
  BookOpen, 
  Sparkles, 
  Settings, 
  Search,
  Volume2,
  List,
  X,
  CheckCircle2
} from 'lucide-react';

const App: React.FC = () => {
  // --- State ---
  const [surahs, setSurahs] = useState<Surah[]>([]);
  const [currentSurah, setCurrentSurah] = useState<SurahDetail | null>(null);
  const [selectedSurahNumber, setSelectedSurahNumber] = useState<number>(1);
  const [currentAyahIndex, setCurrentAyahIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isLooping, setIsLooping] = useState<boolean>(() => {
    const saved = localStorage.getItem('hifz_loop');
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [aiTips, setAiTips] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState<boolean>(false);
  const [reciter, setReciter] = useState<string>(() => {
    return localStorage.getItem('hifz_reciter') || 'ar.alafasy';
  });
  const [showSidebar, setShowSidebar] = useState<boolean>(true);
  const [showSettings, setShowSettings] = useState<boolean>(false);

  // --- Refs ---
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playPromiseRef = useRef<Promise<void> | null>(null);

  // --- Effects ---

  // Initialize App
  useEffect(() => {
    const loadInitialData = async () => {
      setIsLoading(true);
      try {
        const surahList = await fetchSurahs();
        setSurahs(surahList);
        await loadSurah(selectedSurahNumber);
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
    localStorage.setItem('hifz_loop', JSON.stringify(isLooping));
    localStorage.setItem('hifz_reciter', reciter);
  }, [isLooping, reciter]);

  // Handle source changes and automatic playback
  useEffect(() => {
    if (isPlaying) {
      safePlay();
    }
    // When ayah changes, check if insight is cached
    checkInsightCache();
  }, [currentAyahIndex, currentSurah, reciter]);

  // --- Logic ---

  const loadSurah = async (number: number) => {
    setIsLoading(true);
    try {
      const data = await fetchSurahDetail(number, reciter);
      setCurrentSurah(data);
      setCurrentAyahIndex(0);
      setIsPlaying(false);
      setAiTips(null);
    } catch (err) {
      console.error("Failed to load surah", err);
    } finally {
      setIsLoading(false);
    }
  };

  const checkInsightCache = () => {
    if (!currentSurah) return;
    const cacheKey = `hifz_insight_${currentSurah.number}_${currentAyahIndex + 1}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      setAiTips(cached);
    } else {
      setAiTips(null);
    }
  };

  const safePlay = useCallback(async () => {
    if (!audioRef.current) return;
    try {
      if (playPromiseRef.current) {
        await playPromiseRef.current;
      }
      playPromiseRef.current = audioRef.current.play();
      await playPromiseRef.current;
      setIsPlaying(true);
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error("Playback failed:", error);
      }
      setIsPlaying(false);
    } finally {
      playPromiseRef.current = null;
    }
  }, []);

  const safePause = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  }, []);

  const togglePlay = () => {
    if (isPlaying) safePause();
    else safePlay();
  };

  const handleAudioEnd = useCallback(() => {
    if (isLooping) {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        safePlay();
      }
    } else {
      if (currentSurah && currentAyahIndex < currentSurah.ayahs.length - 1) {
        setCurrentAyahIndex(prev => prev + 1);
      } else {
        setIsPlaying(false);
      }
    }
  }, [isLooping, currentSurah, currentAyahIndex, safePlay]);

  const fetchAiTips = async () => {
    if (!currentSurah) return;
    
    // Check cache first
    const cacheKey = `hifz_insight_${currentSurah.number}_${currentAyahIndex + 1}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      setAiTips(cached);
      return;
    }

    setIsAiLoading(true);
    const ayah = currentSurah.ayahs[currentAyahIndex];
    const tips = await getHifzTips(currentSurah.englishName, ayah.numberInSurah, ayah.text);
    
    // Save to cache
    localStorage.setItem(cacheKey, tips);
    setAiTips(tips);
    setIsAiLoading(false);
  };

  const filteredSurahs = surahs.filter(s => 
    s.englishName.toLowerCase().includes(searchTerm.toLowerCase()) || 
    s.number.toString().includes(searchTerm)
  );

  // --- Render ---

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans">
      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Settings className="w-5 h-5 text-indigo-600" />
                App Settings
              </h2>
              <button onClick={() => setShowSettings(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="space-y-3">
                <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <Volume2 className="w-4 h-4" />
                  Preferred Reciter
                </label>
                <div className="grid grid-cols-1 gap-2">
                  {[
                    { id: 'ar.alafasy', name: 'Mishary Rashid Alafasy' },
                    { id: 'ar.abdulsamad', name: 'Abdul Basit' },
                    { id: 'ar.minshawi', name: 'Al-Minshawi' },
                    { id: 'ar.husary', name: 'Al-Husary' }
                  ].map((r) => (
                    <button
                      key={r.id}
                      onClick={() => setReciter(r.id)}
                      className={`flex items-center justify-between p-4 rounded-xl border-2 transition-all ${
                        reciter === r.id 
                          ? 'border-indigo-600 bg-indigo-50/50 text-indigo-900' 
                          : 'border-slate-100 hover:border-slate-200 text-slate-600'
                      }`}
                    >
                      <span className="font-medium">{r.name}</span>
                      {reciter === r.id && <CheckCircle2 className="w-5 h-5 text-indigo-600" />}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100">
                <div className="flex items-center justify-between p-2">
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-slate-800">Auto-Loop Mode</span>
                    <span className="text-xs text-slate-500">Repeats the active verse indefinitely</span>
                  </div>
                  <button 
                    onClick={() => setIsLooping(!isLooping)}
                    className={`relative w-12 h-6 rounded-full transition-colors ${isLooping ? 'bg-indigo-600' : 'bg-slate-200'}`}
                  >
                    <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${isLooping ? 'translate-x-6' : ''}`} />
                  </button>
                </div>
              </div>
            </div>

            <div className="p-6 bg-slate-50 border-t border-slate-100">
              <button 
                onClick={() => {
                  setShowSettings(false);
                  if (currentSurah) loadSurah(currentSurah.number);
                }}
                className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl shadow-lg shadow-indigo-100 hover:bg-indigo-700 active:scale-[0.98] transition-all"
              >
                Save & Apply Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar - Surah List */}
      <aside className={`bg-white border-r border-slate-200 transition-all duration-300 flex flex-col ${showSidebar ? 'w-80' : 'w-0 overflow-hidden border-none'}`}>
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <h2 className="font-bold text-lg flex items-center gap-2 text-indigo-900">
            <BookOpen className="w-5 h-5" />
            Surahs
          </h2>
          <button onClick={() => setShowSidebar(false)} className="lg:hidden p-2 hover:bg-slate-200 rounded-lg">
            <ChevronLeft className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 bg-white">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search Surah..." 
              className="w-full pl-10 pr-4 py-2 bg-slate-100 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredSurahs.map((surah) => (
            <button
              key={surah.number}
              onClick={() => {
                setSelectedSurahNumber(surah.number);
                loadSurah(surah.number);
              }}
              className={`w-full flex items-center justify-between p-3 rounded-xl transition-all ${
                selectedSurahNumber === surah.number 
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' 
                  : 'hover:bg-slate-100 text-slate-700'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full ${
                  selectedSurahNumber === surah.number ? 'bg-indigo-500' : 'bg-slate-200'
                }`}>
                  {surah.number}
                </span>
                <div className="text-left">
                  <div className="font-semibold text-sm">{surah.englishName}</div>
                  <div className={`text-[10px] uppercase tracking-wider ${
                    selectedSurahNumber === surah.number ? 'text-indigo-100' : 'text-slate-400'
                  }`}>
                    {surah.revelationType} • {surah.numberOfAyahs} Ayahs
                  </div>
                </div>
              </div>
              <div className="font-quran text-lg">{surah.name}</div>
            </button>
          ))}
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col relative overflow-hidden">
        {/* Header */}
        <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 p-4 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-4">
            <button onClick={() => setShowSidebar(!showSidebar)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-600">
              <List className="w-5 h-5" />
            </button>
            {currentSurah && (
              <div>
                <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                  {currentSurah.englishName} 
                  <span className="text-sm font-normal text-slate-400">({currentSurah.englishNameTranslation})</span>
                </h1>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button 
              onClick={() => setShowSettings(true)}
              className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-all group"
            >
              <Settings className="w-5 h-5 group-hover:rotate-45 transition-transform duration-300" />
            </button>
          </div>
        </header>

        {/* Content Section */}
        <div className="flex-1 overflow-y-auto px-4 py-8 max-w-5xl mx-auto w-full">
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
            </div>
          ) : currentSurah ? (
            <div className="space-y-12 pb-32">
              {currentSurah.number !== 1 && currentSurah.number !== 9 && (
                <div className="text-center">
                  <div className="font-arabic-display text-4xl text-slate-700 leading-relaxed mb-8">
                    بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
                  </div>
                </div>
              )}

              <div className="space-y-8">
                {currentSurah.ayahs.map((ayah, idx) => (
                  <div 
                    key={ayah.number} 
                    id={`ayah-${idx}`}
                    onClick={() => setCurrentAyahIndex(idx)}
                    className={`group relative p-6 rounded-2xl transition-all duration-300 cursor-pointer border ${
                      currentAyahIndex === idx 
                        ? 'bg-white border-indigo-200 shadow-xl shadow-indigo-50' 
                        : 'bg-transparent border-transparent hover:bg-slate-50/50'
                    }`}
                  >
                    <div className="flex flex-col gap-6">
                      <div className="flex items-start justify-between gap-4">
                        <div className={`flex items-center justify-center w-8 h-8 rounded-lg text-xs font-bold shrink-0 ${
                          currentAyahIndex === idx ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400 group-hover:bg-slate-200'
                        }`}>
                          {ayah.numberInSurah}
                        </div>
                        <div 
                          className={`font-arabic-display text-3xl leading-[2.5rem] text-right text-slate-800 transition-colors w-full ${
                            currentAyahIndex === idx ? 'text-indigo-900' : ''
                          }`} 
                          dir="rtl"
                        >
                          {ayah.text}
                        </div>
                      </div>
                      
                      {currentAyahIndex === idx && (
                        <div className="pt-4 border-t border-indigo-50 animate-in fade-in slide-in-from-top-1 duration-300">
                          <button 
                            onClick={(e) => { e.stopPropagation(); fetchAiTips(); }}
                            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-50 to-blue-50 text-indigo-700 rounded-full text-xs font-semibold hover:from-indigo-100 hover:to-blue-100 transition-all shadow-sm"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            {aiTips ? 'Refresh Insight' : 'Get Memorization Insight'}
                          </button>

                          {isAiLoading && (
                            <div className="mt-4 flex items-center gap-3 animate-pulse">
                              <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce"></div>
                              <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce delay-75"></div>
                              <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce delay-150"></div>
                              <span className="text-xs text-slate-400 italic">Gemini is thinking...</span>
                            </div>
                          )}

                          {aiTips && (
                            <div className="mt-4 p-5 bg-indigo-50/50 rounded-2xl border border-indigo-100 shadow-inner">
                              <div className="prose prose-sm prose-indigo max-w-none text-slate-700">
                                <ReactMarkdown>{aiTips}</ReactMarkdown>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-20">
              <BookOpen className="w-16 h-16 text-slate-200 mx-auto mb-4" />
              <p className="text-slate-400">Select a Surah to begin your Hifz journey</p>
            </div>
          )}
        </div>

        {/* Floating Player Controls */}
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-transparent pointer-events-none z-50">
          <div className="max-w-3xl mx-auto pointer-events-auto">
            <div className="bg-white/90 backdrop-blur-xl border border-slate-200 shadow-2xl rounded-2xl p-4 md:p-6 flex flex-col gap-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-indigo-600 text-white rounded-xl flex items-center justify-center font-bold text-lg shadow-lg shadow-indigo-200">
                    {currentSurah ? currentAyahIndex + 1 : '--'}
                  </div>
                  <div>
                    <div className="text-sm font-bold text-slate-900 truncate max-w-[150px] md:max-w-none">
                      {currentSurah ? `Ayah ${currentAyahIndex + 1} of ${currentSurah.ayahs.length}` : 'Pick an Ayah'}
                    </div>
                    <div className="text-xs text-slate-500 font-medium">
                      {currentSurah?.englishName || 'No Surah Selected'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 md:gap-4">
                   <button 
                    onClick={() => setIsLooping(!isLooping)}
                    className={`p-2.5 rounded-full transition-all ${
                      isLooping ? 'bg-indigo-100 text-indigo-600 ring-2 ring-indigo-200' : 'text-slate-400 hover:bg-slate-100'
                    }`}
                    title="Loop Current Verse"
                  >
                    <Repeat className="w-5 h-5" />
                  </button>

                  <div className="h-6 w-px bg-slate-200 mx-1"></div>

                  <button 
                    onClick={() => setCurrentAyahIndex(prev => Math.max(0, prev - 1))}
                    disabled={currentAyahIndex === 0}
                    className="p-2.5 text-slate-600 hover:bg-slate-100 rounded-full disabled:opacity-30 disabled:hover:bg-transparent"
                  >
                    <ChevronLeft className="w-6 h-6" />
                  </button>

                  <button 
                    onClick={togglePlay}
                    className="w-12 h-12 md:w-14 md:h-14 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full flex items-center justify-center shadow-lg hover:shadow-indigo-200 active:scale-95 transition-all"
                  >
                    {isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current ml-1" />}
                  </button>

                  <button 
                    onClick={() => setCurrentAyahIndex(prev => currentSurah ? Math.min(currentSurah.ayahs.length - 1, prev + 1) : prev)}
                    disabled={currentSurah && currentAyahIndex === currentSurah.ayahs.length - 1}
                    className="p-2.5 text-slate-600 hover:bg-slate-100 rounded-full disabled:opacity-30 disabled:hover:bg-transparent"
                  >
                    <ChevronRight className="w-6 h-6" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Hidden Audio Element */}
        {currentSurah && (
          <audio
            ref={audioRef}
            src={getAyahAudioUrl(currentSurah.ayahs[currentAyahIndex].number, reciter)}
            onEnded={handleAudioEnd}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
          />
        )}
      </main>
    </div>
  );
};

export default App;
