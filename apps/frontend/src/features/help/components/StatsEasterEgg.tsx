import { useState, useEffect, useRef, useCallback } from 'react';

const STATS: Array<{ icon: string; label: string; value: string }> = [
  { icon: 'schedule',       label: 'Constraint rules',     value: '27' },
  { icon: 'check_circle',   label: 'Tests passing',        value: '179' },
  { icon: 'database',       label: 'Database tables',      value: '22' },
  { icon: 'api',            label: 'API endpoints',        value: '90+' },
  { icon: 'school',         label: 'Engineering depts',    value: '10' },
  { icon: 'menu_book',      label: 'Subjects supported',   value: '76' },
  { icon: 'calendar_month', label: 'Timetable views',      value: '5' },
  { icon: 'bolt',           label: 'CP-SAT solver',        value: 'Active' },
];

const TOTAL_TAPS = 7;
const RESET_DELAY_MS = 2000;

export function StatsEasterEgg() {
  const [taps, setTaps] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [musicPlaying, setMusicPlaying] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const resetTimerRef = useRef<number | null>(null);

  // ── Audio setup ──
  useEffect(() => {
    const audio = new Audio('/help/music/song.mp3');
    audio.loop = true;
    audio.volume = 0.4;
    audio.preload = 'auto';
    audioRef.current = audio;

    return () => {
      audio.pause();
      audio.src = '';
    };
  }, []);

  // ── Start music (inside user gesture) ──
  const startMusic = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (musicPlaying) return;

    void audio.play().then(
      () => setMusicPlaying(true),
      (err) => {
        console.warn('Autoplay blocked:', err);
        setMusicPlaying(false);
      },
    );
  }, [musicPlaying]);

  // ── Stop music ──
  const stopMusic = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    setMusicPlaying(false);
  }, []);

  // ── Reset counter after idle ──
  const scheduleReset = useCallback(() => {
    if (resetTimerRef.current) {
      window.clearTimeout(resetTimerRef.current);
    }
    resetTimerRef.current = window.setTimeout(() => {
      setTaps(0);
      setHint(null);
    }, RESET_DELAY_MS);
  }, []);

  // ── Trigger tap handler ──
  const handleTap = useCallback(() => {
    // If already revealed → hide + stop music
    if (revealed) {
      setRevealed(false);
      setTaps(0);
      setHint(null);
      stopMusic();
      return;
    }

    const next = taps + 1;

    // Feedback for taps 3 through 6
    const remaining = TOTAL_TAPS - next;
    if (next >= 3 && next < TOTAL_TAPS) {
      setHint(
        remaining === 1
          ? `${remaining} tap away…`
          : `${remaining} taps away…`,
      );
    }

    if (next >= TOTAL_TAPS) {
      // Reveal!
      setRevealed(true);
      setTaps(0);
      setHint(null);
      startMusic();
      return;
    }

    setTaps(next);
    scheduleReset();
  }, [taps, revealed, startMusic, stopMusic, scheduleReset]);

  // ── Music toggle ──
  const toggleMusic = useCallback(() => {
    if (musicPlaying) {
      stopMusic();
    } else {
      startMusic();
    }
  }, [musicPlaying, startMusic, stopMusic]);

  return (
    <div className="relative mt-4">
      {/* Trigger — 20px sparkle, Android-style tap counter */}
      <button
        type="button"
        onClick={handleTap}
        className="mx-auto flex h-8 w-8 items-center justify-center text-slate-300 transition-colors hover:text-brand-700"
        aria-label="Hidden trigger"
        tabIndex={-1}
      >
        <span className="material-symbols-outlined text-[20px]">
          auto_awesome
        </span>
      </button>

      {/* Progressive hint — Android-style */}
      {hint && !revealed && (
        <p className="mt-2 text-center text-[11px] italic text-slate-400 animate-fade-in">
          {hint}
        </p>
      )}

      {/* Revealed panel */}
      {revealed && (
        <div className="animate-fade-up mx-auto mt-4 max-w-lg border border-brand-200 bg-gradient-to-br from-brand-50 to-white p-5">
          <div className="mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-brand-700">
              auto_awesome
            </span>
            <h3 className="text-sm font-semibold text-slate-900">
              CoE-NNECT by the numbers
            </h3>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {STATS.map((s) => (
              <div
                key={s.label}
                className="flex items-center gap-2 border border-slate-200 bg-white px-3 py-2"
              >
                <span className="material-symbols-outlined text-[16px] text-brand-700">
                  {s.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[10px] uppercase tracking-wider text-slate-500">
                    {s.label}
                  </div>
                  <div className="text-sm font-semibold text-slate-900">
                    {s.value}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-200 pt-3">
            <p className="text-[10px] italic text-slate-400">
              You found the easter egg. 🎉
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleMusic}
                className={
                  'flex items-center gap-1 border px-2 py-1 text-[10px] font-medium transition-colors ' +
                  (musicPlaying
                    ? 'border-brand-700 bg-brand-700 text-white hover:bg-brand-800'
                    : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50')
                }
                title="Toggle music"
              >
                <span className="material-symbols-outlined text-[14px]">
                  {musicPlaying ? 'pause' : 'play_arrow'}
                </span>
                {musicPlaying ? 'Pause' : 'Play music'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setRevealed(false);
                  setTaps(0);
                  setHint(null);
                  stopMusic();
                }}
                className="text-[10px] text-slate-500 hover:text-slate-800"
              >
                Hide
              </button>
            </div>
          </div>

          <p className="mt-2 text-center text-[9px] text-slate-400">
            Music: <span className="font-medium">song.mp3</span>
          </p>
        </div>
      )}
    </div>
  );
}