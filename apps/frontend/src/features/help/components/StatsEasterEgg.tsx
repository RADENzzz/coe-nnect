import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchStatsOverview } from '../../../api/stats.api';
import {
  EASTER_EGG_TOTAL_TAPS,
  useEasterEggStore,
} from '../store/easter-egg.store';
import { RepoContributorsCard } from './RepoContributorsCard';
const STATS: Array<{
  icon: string;
  label: string;
  key:
    | 'activeDepartments'
    | 'activeFaculty'
    | 'activeSubjects'
    | 'activeRooms'
    | 'activeSections'
    | 'scheduleEntries'
    | 'academicTerms'
    | 'activeAccounts';
}> = [
  {
    icon: 'school',
    label: 'Active departments',
    key: 'activeDepartments',
  },
  { icon: 'groups', label: 'Active faculty', key: 'activeFaculty' },
  { icon: 'menu_book', label: 'Active subjects', key: 'activeSubjects' },
  { icon: 'meeting_room', label: 'Active rooms', key: 'activeRooms' },
  { icon: 'class', label: 'Active sections', key: 'activeSections' },
  {
    icon: 'calendar_month',
    label: 'Schedule entries',
    key: 'scheduleEntries',
  },
  { icon: 'event', label: 'Academic terms', key: 'academicTerms' },
  {
    icon: 'manage_accounts',
    label: 'Active accounts',
    key: 'activeAccounts',
  },
];

const TEAM_NAMES: string[] = [
  'Jazmine',
  'Alrhaden',
  'Giel',
  'Edzel',
  'Roland',
  'Andre',
  'Aizzah',
  'Euwan',
];

interface Props {
  onOverlayChange?: (active: boolean) => void;
}

interface NameOrbit {
  name: string;
  id: number;
  centerTop: number;
  centerLeft: number;
  radiusX: number;
  radiusY: number;
  startAngle: number;
  direction: 1 | -1;
  duration: number;
  delay: number;
  size: number;
  rotation: number;
  isEllipse: boolean;
}

export function StatsEasterEgg({ onOverlayChange }: Props) {
  const revealed = useEasterEggStore((s) => s.revealed);
  const taps = useEasterEggStore((s) => s.taps);
  const close = useEasterEggStore((s) => s.close);
  const {
    data: stats,
    isLoading: statsLoading,
    error: statsError,
    refetch: refetchStats,
  } = useQuery({
    queryKey: ['stats', 'overview'],
    queryFn: fetchStatsOverview,
    enabled: revealed,
  });

  const [musicPlaying, setMusicPlaying] = useState(false);
  const [discoEnabled, setDiscoEnabled] = useState(true);
  const [entranceDone, setEntranceDone] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const onOverlayChangeRef = useRef(onOverlayChange);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onOverlayChangeRef.current = onOverlayChange;
  }, [onOverlayChange]);

  // ── Audio ──
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

  useEffect(() => {
    if (revealed) setDiscoEnabled(true);
  }, [revealed]);

  const discoActive = revealed && discoEnabled;
  useEffect(() => {
    onOverlayChangeRef.current?.(revealed);
  }, [revealed]);

  // ── Music start / stop ──
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

  const stopMusic = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    setMusicPlaying(false);
  }, []);

  useEffect(() => {
    if (revealed) startMusic();
    else stopMusic();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed]);

  // ── Entrance → dance handoff ──
  useEffect(() => {
    if (!revealed) {
      setEntranceDone(false);
      return;
    }
    const t = window.setTimeout(() => setEntranceDone(true), 450);
    return () => window.clearTimeout(t);
  }, [revealed]);

  // ── Auto-scroll to center the panel ──
  useEffect(() => {
    if (!revealed) return;
    const centerPanel = (behavior: ScrollBehavior) => {
      const el = panelRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const targetY =
        window.scrollY + rect.top - (window.innerHeight - rect.height) / 2;
      window.scrollTo({ top: Math.max(0, targetY), behavior });
    };
    const immediate = window.setTimeout(() => centerPanel('auto'), 20);
    const afterAnim = window.setTimeout(() => centerPanel('smooth'), 500);
    return () => {
      window.clearTimeout(immediate);
      window.clearTimeout(afterAnim);
    };
  }, [revealed]);

  // ── Esc to hide ──
  useEffect(() => {
    if (!revealed) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [revealed, close]);

  const toggleMusic = useCallback(() => {
    if (musicPlaying) stopMusic();
    else startMusic();
  }, [musicPlaying, startMusic, stopMusic]);

  // ═══ Team name orbits ═══
  const nameOrbits = useMemo<NameOrbit[]>(
    () =>
      TEAM_NAMES.map((name, i) => {
        const isEllipse = Math.random() < 0.5;
        const radiusX = 18 + Math.random() * 22;
        const radiusY = isEllipse ? 15 + Math.random() * 20 : radiusX;
        const startAngle = Math.random() * 360;
        const direction: 1 | -1 = Math.random() < 0.5 ? 1 : -1;

        return {
          name,
          id: i,
          centerTop: -5 + Math.random() * 110,
          centerLeft: -5 + Math.random() * 110,
          radiusX,
          radiusY,
          startAngle,
          direction,
          duration: 14 + Math.random() * 16,
          delay: -Math.random() * 25,
          size: 14 + Math.random() * 16,
          rotation: (Math.random() - 0.5) * 12,
          isEllipse,
        };
      }),
    [],
  );

  // ═══ Generate literal-value keyframes as a string ═══
  const keyframesCss = useMemo(() => {
    return nameOrbits
      .map((n) => {
        const kfName = `disco-orbit-${n.id}`;
        const rot = n.rotation;

        const stops = [0, 12.5, 25, 37.5, 50, 62.5, 75, 87.5, 100]
          .map((pct) => {
            const angle = n.startAngle + (pct / 100) * 360 * n.direction;
            const rad = (angle * Math.PI) / 180;
            const x = Math.cos(rad) * n.radiusX;
            const y = Math.sin(rad) * n.radiusY;
            return `${pct}% {
            transform: translate(-50%, -50%) translate(${x.toFixed(2)}vw, ${y.toFixed(2)}vh) rotate(${rot}deg);
          }`;
          })
          .join('\n');

        return `@keyframes ${kfName} {\n${stops}\n}`;
      })
      .join('\n');
  }, [nameOrbits]);

  // ── Portal to body ──
  const overlayContent =
    typeof document !== 'undefined'
      ? createPortal(
          <>
            {/* ⭐ Inject literal-value keyframes per name — no CSS vars */}
            {discoActive && (
              <style
                // eslint-disable-next-line react/no-danger
                dangerouslySetInnerHTML={{ __html: keyframesCss }}
              />
            )}

            <div
              className={'disco-overlay ' + (discoActive ? 'active' : '')}
              aria-hidden="true"
            >
              <div className="disco-grid" />
              <div className="disco-pulse" />
              <div className="disco-flash" />
              <div className="disco-vignette" />
              <div className="disco-floor-glow" />

              {/* Floating team names — literal-keyframe animation */}
              <div className="disco-names">
                {nameOrbits.map((n) => (
                  <span
                    key={n.id}
                    className="disco-name"
                    style={{
                      top: `${n.centerTop}%`,
                      left: `${n.centerLeft}%`,
                      fontSize: `${n.size}px`,
                      animationName: `disco-orbit-${n.id}, name-pulse`,
                      animationDuration: `${n.duration}s, 2s`,
                      animationTimingFunction: 'linear, ease-in-out',
                      animationIterationCount: 'infinite, infinite',
                      animationDelay: `${n.delay}s, ${n.delay / 2}s`,
                    }}
                  >
                    {n.name}
                  </span>
                ))}
              </div>
            </div>
          </>,
          document.body,
        )
      : null;

  return (
    <>
      {overlayContent}

      <div className="relative mt-4">
        {revealed && (
          <div
            ref={panelRef}
            className={
              'relative z-[9999] mx-auto mt-4 max-w-lg border-2 border-brand-700 bg-white p-5 shadow-2xl ' +
              (!entranceDone ? 'animate-fade-up' : '') +
              ' ' +
              (entranceDone && discoActive ? 'disco-panel-active' : '')
            }
          >
            <div className="mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px] text-brand-700">
                auto_awesome
              </span>
              <h3
                className={
                  'text-sm font-semibold text-slate-900 ' +
                  (discoActive ? 'disco-title' : '')
                }
              >
                CoE-NNECT by the numbers
              </h3>
            </div>

            <div
              className={
                'grid grid-cols-2 gap-2 ' +
                (discoActive ? 'disco-stats-grid' : '')
              }
            >
              {STATS.map((s) => (
                <div
                  key={s.label}
                  className={
                    'flex items-center gap-2 border border-slate-200 bg-white px-3 py-2 ' +
                    (discoActive ? 'disco-stat' : '')
                  }
                >
                  <span
                    className={
                      'material-symbols-outlined text-[16px] text-brand-700 ' +
                      (discoActive ? 'disco-stat-icon' : '')
                    }
                  >
                    {s.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[10px] uppercase tracking-wider text-slate-500">
                      {s.label}
                    </div>
                    <div
                      className={
                        'text-sm font-semibold text-slate-900 ' +
                        (discoActive ? 'disco-stat-value' : '')
                      }
                    >
                      {statsLoading ? '—' : stats?.[s.key]?.toLocaleString() ?? '—'}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {statsError && (
              <div
                role="alert"
                className="mt-3 flex items-center justify-between gap-3 border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800"
              >
                <span>
                  {statsError instanceof Error
                    ? statsError.message
                    : 'Unable to load statistics.'}
                </span>
                <button
                  type="button"
                  onClick={() => void refetchStats()}
                  className="shrink-0 font-semibold underline"
                >
                  Retry
                </button>
              </div>
            )}

            {/* ⭐ GitHub Contributors easter egg */}
            <RepoContributorsCard />

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3">
              <p
                className={
                  'text-[10px] italic text-slate-400 ' +
                  (discoActive ? 'disco-tagline' : '')
                }
              >
                You found the easter egg. 🎉
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDiscoEnabled((v) => !v)}
                  className={
                    'flex items-center gap-1 border px-2 py-1 text-[10px] font-medium transition-colors ' +
                    (discoEnabled
                      ? 'border-brand-700 bg-brand-700 text-white hover:bg-brand-800'
                      : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50')
                  }
                  title="Toggle disco lights"
                >
                  <span className="material-symbols-outlined text-[14px]">
                    {discoEnabled ? 'celebration' : 'light_off'}
                  </span>
                  Disco: {discoEnabled ? 'On' : 'Off'}
                </button>
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
                  onClick={close}
                  className="text-[10px] text-slate-500 hover:text-slate-800"
                >
                  Hide
                </button>
              </div>
            </div>

            <p className="mt-2 text-center text-[9px] text-slate-400">
              Music: <span className="font-medium">はいはい、承知しました  by Muso ^._.^</span>
            </p>
          </div>
        )}
      </div>
    </>
  );
}