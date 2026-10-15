import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { HelpTOC } from './components/HelpTOC';
import { GettingStarted } from './sections/GettingStarted';
import { RoleGuides } from './sections/RoleGuides';
import { FeatureWalkthroughs } from './sections/FeatureWalkthroughs';
import { FAQ } from './sections/FAQ';
import { Troubleshooting } from './sections/Troubleshooting';
import { TeamInfo } from './sections/TeamInfo';
import { VersionInfo } from './sections/VersionInfo';
import { StatsEasterEgg } from './components/StatsEasterEgg';
import { useAuthStore } from '../../store/auth.store';
import {
  Reveal,
  ScrollProgress,
  BackToTop,
  ShimmerText,
} from './components/animations';

const SECTIONS = [
  { id: 'getting-started', label: 'Getting Started' },
  { id: 'role-guides', label: 'Role Guides' },
  { id: 'walkthroughs', label: 'Feature Walkthroughs' },
  { id: 'faq', label: 'FAQ' },
  { id: 'troubleshooting', label: 'Troubleshooting' },
  { id: 'team', label: 'About the Team' },
  { id: 'version', label: 'Version Info' },
];

const KEYWORDS: Record<string, string[]> = {
  'getting-started': ['start', 'sign in', 'login', 'orientation', 'onboarding'],
  'role-guides': ['dean', 'department head', 'permission', 'access', 'role'],
  walkthroughs: ['gif', 'demo', 'video', 'how to', 'walkthrough'],
  faq: ['question', 'answer', 'common'],
  troubleshooting: ['error', 'broken', 'fix', 'problem', 'issue', 'bug'],
  team: ['developer', 'client', 'author', 'credit'],
  version: ['build', 'release', 'changelog', 'about'],
};

export default function HelpPage() {
  const profile = useAuthStore((s) => s.profile);
  const [activeId, setActiveId] = useState('getting-started');
  const [overlayActive, setOverlayActive] = useState(false);
  const [query, setQuery] = useState('');
  const reduce = useReducedMotion();

  // ⌨️ "/" focuses search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.key === '/' &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        e.preventDefault();
        document.getElementById('help-search')?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Scroll spy
  useEffect(() => {
    if (overlayActive) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: '-80px 0px -60% 0px', threshold: 0 },
    );
    for (const s of SECTIONS) {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [overlayActive]);

  const filteredSections = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SECTIONS;
    return SECTIONS.filter((s) => {
      if (s.label.toLowerCase().includes(q)) return true;
      const kws = KEYWORDS[s.id] ?? [];
      return kws.some((k) => k.includes(q) || q.includes(k));
    });
  }, [query]);

  const visibleIds = new Set(filteredSections.map((s) => s.id));

  return (
    <div className="relative mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-10">
      <ScrollProgress />

      {/* Hero */}
      <header className="relative mb-8 overflow-hidden border border-slate-200 bg-white p-6 md:p-8">
        {!reduce && (
          <motion.div
            aria-hidden
            className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-brand-100/50 blur-3xl"
            animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.8, 0.5] }}
            transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.2, 0.9, 0.3, 1] }}
          className="relative"
        >
          <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-brand-700">
            <span className="material-symbols-outlined text-[16px]">
              help_outline
            </span>
            Help &amp; Documentation
          </div>
          <h1 className="text-2xl font-semibold text-slate-900 md:text-3xl">
            Welcome to <ShimmerText>CoE-NNECT Help</ShimmerText>
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Everything you need to use the College of Engineering Scheduling
            System. Browse feature walkthroughs, FAQs, and team information
            below.
          </p>

          {/* Search */}
          <div className="relative mt-5 max-w-md">
            <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-slate-400">
              search
            </span>
            <input
              id="help-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search help…"
              className="input pl-10 pr-12"
              aria-label="Search help sections"
            />
            <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 border border-slate-300 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 md:inline-block">
              /
            </kbd>
          </div>
        </motion.div>
      </header>

      <div className="flex flex-col gap-8 lg:flex-row">
        <HelpTOC
          sections={filteredSections}
          activeId={activeId}
          className="lg:sticky lg:top-6 lg:h-fit lg:w-56 lg:shrink-0"
        />

        <div className="flex-1 space-y-12">
          {visibleIds.has('getting-started') && (
            <Reveal>
              <section id="getting-started" className="scroll-mt-24">
                <GettingStarted role={profile?.role ?? null} />
              </section>
            </Reveal>
          )}
          {visibleIds.has('role-guides') && (
            <Reveal>
              <section id="role-guides" className="scroll-mt-24">
                <RoleGuides role={profile?.role ?? null} />
              </section>
            </Reveal>
          )}
          {visibleIds.has('walkthroughs') && (
            <Reveal>
              <section id="walkthroughs" className="scroll-mt-24">
                <FeatureWalkthroughs />
              </section>
            </Reveal>
          )}
          {visibleIds.has('faq') && (
            <Reveal>
              <section id="faq" className="scroll-mt-24">
                <FAQ />
              </section>
            </Reveal>
          )}
          {visibleIds.has('troubleshooting') && (
            <Reveal>
              <section id="troubleshooting" className="scroll-mt-24">
                <Troubleshooting />
              </section>
            </Reveal>
          )}
          {visibleIds.has('team') && (
            <Reveal>
              <section id="team" className="scroll-mt-24">
                <TeamInfo />
              </section>
            </Reveal>
          )}
          {visibleIds.has('version') && (
            <Reveal>
              <section id="version" className="scroll-mt-24">
                <VersionInfo />
              </section>
            </Reveal>
          )}

          {filteredSections.length === 0 && (
            <div className="animate__animated animate__fadeIn border border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
              No sections match “{query}”.
            </div>
          )}
        </div>
      </div>

      <footer className="mt-16 border-t border-slate-200 pt-6 text-center text-xs text-slate-500">
        <p>
          CoE-NNECT is developed by the{' '}
          <span className="font-medium text-slate-700">
            Department of Computer Engineering
          </span>
          , College of Engineering, Western Mindanao State University.
        </p>
        <p className="mt-1 text-[11px] text-slate-400">
          CPE SD 3 — Management Information System · Academic Year 2026–2027
        </p>

        <StatsEasterEgg onOverlayChange={setOverlayActive} />
      </footer>

      <BackToTop />
    </div>
  );
}