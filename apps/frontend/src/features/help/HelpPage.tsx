import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { HelpTOC } from './components/HelpTOC';
import { GettingStarted } from './sections/GettingStarted';
import { RoleGuides } from './sections/RoleGuides';
import { GuidedTours } from './sections/GuidedTours';
import { FeatureWalkthroughs } from './sections/FeatureWalkthroughs';
import { FAQ } from './sections/FAQ';
import { Troubleshooting } from './sections/Troubleshooting';
import { TeamInfo } from './sections/TeamInfo';
import { VersionInfo } from './sections/VersionInfo';
import { StatsEasterEgg } from './components/StatsEasterEgg';
import { useAuthStore } from '../../store/auth.store';
import { useTutorialStore } from '../../store/tutorial.store';
import {
  Reveal,
  ScrollProgress,
  BackToTop,
  ShimmerText,
} from './components/animations';
import { RepoCommitHistory } from './components/RepoCommitHistory';
import { FAQ as FAQ_ITEMS } from './data/faq';
import { TROUBLESHOOTING } from './data/troubleshooting';
import { WALKTHROUGHS } from './data/walkthroughs';
import {
  getRecommendedTours,
  getTourForPath,
  getTourStartPath,
  WELCOME_TOUR_ID,
} from '../tutorial/tours';
import Icon from '../../components/ui/Icon';

const SECTIONS = [
  { id: 'getting-started', label: 'Getting Started' },
  { id: 'guided-tours', label: 'Guided Tours' },
  { id: 'role-guides', label: 'Role Guides' },
  { id: 'walkthroughs', label: 'Feature Walkthroughs' },
  { id: 'faq', label: 'FAQ' },
  { id: 'troubleshooting', label: 'Troubleshooting' },
  { id: 'team', label: 'About the Team' },
  { id: 'version', label: 'Version Info' },
  { id: 'commit-history', label: 'Development History' },
];

const KEYWORDS: Record<string, string[]> = {
  'getting-started': ['start', 'sign in', 'login', 'orientation', 'onboarding', 'shortcut'],
  'guided-tours': ['tour', 'guide', 'walkthrough', 'tutorial', 'progress'],
  'role-guides': ['dean', 'secretary', 'department head', 'permission', 'access', 'role'],
  walkthroughs: ['gif', 'demo', 'video', 'how to', 'walkthrough', 'preview'],
  faq: ['question', 'answer', 'common'],
  troubleshooting: ['error', 'broken', 'fix', 'problem', 'issue', 'bug'],
  team: ['developer', 'client', 'author', 'credit'],
  version: ['build', 'release', 'changelog', 'about'],
  'commit-history': ['git', 'commits', 'history', 'log', 'repo', 'github'],
};

type ResultType = 'Section' | 'FAQ' | 'Troubleshooting' | 'Walkthrough' | 'Tour';

interface SearchResult {
  key: string;
  type: ResultType;
  title: string;
  snippet: string;
  sectionId: string;
}

const ROLE_LABELS: Record<string, string> = {
  college_dean: 'College Dean',
  college_secretary: 'College Secretary',
  department_head: 'Department Head',
  administrator: 'Administrator',
};

const RESULT_STYLES: Record<ResultType, { icon: string; className: string }> = {
  Section: { icon: 'article', className: 'bg-primary/10 text-primary' },
  FAQ: { icon: 'help', className: 'bg-sky-500/10 text-sky-600' },
  Troubleshooting: {
    icon: 'build',
    className: 'bg-amber-500/10 text-amber-600',
  },
  Walkthrough: {
    icon: 'play_circle',
    className: 'bg-emerald-500/10 text-emerald-600',
  },
  Tour: { icon: 'flag', className: 'bg-violet-500/10 text-violet-600' },
};

function snippetAround(text: string, query: string, max = 140): string {
  const index = text.toLowerCase().indexOf(query.toLowerCase());
  if (index < 0) return text.length > max ? `${text.slice(0, max)}…` : text;
  const start = Math.max(0, index - 45);
  const end = Math.min(text.length, index + query.length + 75);
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${
    end < text.length ? '…' : ''
  }`;
}

export default function HelpPage() {
  const profile = useAuthStore((s) => s.profile);
  const location = useLocation();
  const navigate = useNavigate();
  const completed = useTutorialStore((s) => s.completed);
  const startTour = useTutorialStore((s) => s.startTour);
  const queueTour = useTutorialStore((s) => s.queueTour);
  const markOnboarded = useTutorialStore((s) => s.markOnboarded);
  const openGuides = useTutorialStore((s) => s.openGuides);
  const [activeId, setActiveId] = useState('getting-started');
  const [overlayActive, setOverlayActive] = useState(false);
  const [query, setQuery] = useState('');
  const reduce = useReducedMotion();

  const role = profile?.role ?? null;
  const tours = useMemo(() => getRecommendedTours(role), [role]);
  const completedTours = tours.filter((tour) => completed[tour.id]).length;
  const pageTour = getTourForPath(location.pathname, role);

  // ⌨️ "/" focuses search
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        event.key === '/' &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        event.preventDefault();
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
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: '-80px 0px -60% 0px', threshold: 0 },
    );
    for (const section of SECTIONS) {
      const el = document.getElementById(section.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [overlayActive]);

  const results = useMemo<SearchResult[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const found: SearchResult[] = [];

    for (const section of SECTIONS) {
      const keywords = KEYWORDS[section.id] ?? [];
      if (
        section.label.toLowerCase().includes(q) ||
        keywords.some((keyword) => keyword.includes(q) || q.includes(keyword))
      ) {
        found.push({
          key: `section-${section.id}`,
          type: 'Section',
          title: section.label,
          snippet: 'Jump to this section of the Help center.',
          sectionId: section.id,
        });
      }
    }

    for (const item of FAQ_ITEMS) {
      if (
        item.q.toLowerCase().includes(q) ||
        item.a.toLowerCase().includes(q)
      ) {
        found.push({
          key: `faq-${item.q}`,
          type: 'FAQ',
          title: item.q,
          snippet: snippetAround(item.a, q),
          sectionId: 'faq',
        });
      }
    }

    for (const item of TROUBLESHOOTING) {
      const haystack = [item.issue, item.fix, ...(item.checks ?? [])].join(' ');
      if (haystack.toLowerCase().includes(q)) {
        found.push({
          key: `trouble-${item.issue}`,
          type: 'Troubleshooting',
          title: item.issue,
          snippet: snippetAround(item.fix, q),
          sectionId: 'troubleshooting',
        });
      }
    }

    for (const item of WALKTHROUGHS) {
      const haystack = [item.title, ...item.steps].join(' ');
      if (haystack.toLowerCase().includes(q)) {
        found.push({
          key: `walkthrough-${item.id}`,
          type: 'Walkthrough',
          title: item.title,
          snippet: snippetAround(item.steps.join(' '), q),
          sectionId: 'walkthroughs',
        });
      }
    }

    for (const tour of tours) {
      const haystack = [
        tour.title,
        tour.description,
        ...tour.steps.map((step) => `${step.title} ${step.body}`),
      ].join(' ');
      if (haystack.toLowerCase().includes(q)) {
        found.push({
          key: `tour-${tour.id}`,
          type: 'Tour',
          title: tour.title,
          snippet: snippetAround(tour.description, q),
          sectionId: 'guided-tours',
        });
      }
    }

    return found.slice(0, 40);
  }, [query, tours]);

  const matchedSectionIds = useMemo(
    () => new Set(results.map((result) => result.sectionId)),
    [results],
  );

  const visibleSections = query.trim()
    ? SECTIONS.filter((section) => matchedSectionIds.has(section.id))
    : SECTIONS;
  const visibleIds = new Set(visibleSections.map((section) => section.id));

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - 80;
    window.scrollTo({ top, behavior: reduce ? 'auto' : 'smooth' });
  };

  const openResult = (sectionId: string) => {
    setQuery('');
    window.setTimeout(() => scrollToSection(sectionId), 60);
  };

  const startWelcome = () => {
    markOnboarded();
    startTour(WELCOME_TOUR_ID);
  };

  const startPageTour = () => {
    markOnboarded();
    if (!pageTour) {
      openGuides();
      return;
    }
    const targetPath = getTourStartPath(pageTour, location.pathname);
    if (
      targetPath &&
      targetPath !== location.pathname &&
      !pageTour.paths?.some((path) => path === location.pathname)
    ) {
      queueTour(pageTour.id);
      navigate(targetPath);
      return;
    }
    startTour(pageTour.id);
  };

  return (
    <div className="relative mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-10">
      <ScrollProgress />

      {/* Hero */}
      <header
        data-tour="help-header"
        className="relative mb-8 overflow-hidden rounded-2xl border border-outline-variant bg-surface p-6 md:p-8"
      >
        {!reduce && (
          <motion.div
            aria-hidden
            className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/15 blur-3xl"
            animate={{ scale: [1, 1.15, 1], opacity: [0.4, 0.7, 0.4] }}
            transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.2, 0.9, 0.3, 1] }}
          className="relative"
        >
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-wider text-primary">
            <Icon name="help" size={16} />
            Help &amp; Documentation
            {role && (
              <span className="rounded-full border border-outline-variant bg-surface-container-low px-2 py-0.5 text-[10px] font-semibold normal-case tracking-normal text-on-surface-variant">
                {ROLE_LABELS[role] ?? role}
              </span>
            )}
          </div>
          <h1 className="text-2xl font-semibold text-on-surface md:text-3xl">
            Welcome to{' '}
            <ShimmerText
              colors={[
                'rgb(var(--primary))',
                'rgb(var(--primary-container))',
                'rgb(var(--primary))',
              ]}
            >
              CoE-NNECT Help
            </ShimmerText>
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-on-surface-variant">
            Search the whole knowledge base, follow a guided tour, or jump
            straight to role-specific guidance. Progress is saved in this
            browser.
          </p>

          {/* Quick actions */}
          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={startWelcome}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-xs font-semibold text-on-primary transition-opacity hover:opacity-90"
            >
              <Icon name="play_arrow" size={15} />
              {completed[WELCOME_TOUR_ID] ? 'Replay welcome tour' : 'Start welcome tour'}
            </button>
            <button
              type="button"
              onClick={startPageTour}
              className="inline-flex items-center gap-2 rounded-lg border border-outline-variant bg-surface px-3.5 py-2 text-xs font-semibold text-on-surface transition-colors hover:bg-surface-container"
            >
              <Icon name="tour" size={15} />
              Tour this page
            </button>
            <button
              type="button"
              onClick={openGuides}
              className="inline-flex items-center gap-2 rounded-lg border border-outline-variant bg-surface px-3.5 py-2 text-xs font-semibold text-on-surface transition-colors hover:bg-surface-container"
            >
              <Icon name="menu_book" size={15} />
              Open guide library
            </button>
          </div>

          {/* Progress snapshot */}
          <div className="mt-5 grid gap-2 sm:grid-cols-3">
            {[
              {
                label: 'Tours completed',
                value: `${completedTours}/${tours.length}`,
                icon: 'flag',
              },
              {
                label: 'Walkthroughs',
                value: String(WALKTHROUGHS.length),
                icon: 'play_circle',
              },
              {
                label: 'FAQ answers',
                value: String(FAQ_ITEMS.length),
                icon: 'help',
              },
            ].map((stat) => (
              <div
                key={stat.label}
                className="flex items-center gap-2 rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2"
              >
                <Icon name={stat.icon} size={15} className="text-primary" />
                <div className="min-w-0">
                  <p className="text-sm font-bold leading-none text-on-surface">
                    {stat.value}
                  </p>
                  <p className="mt-0.5 truncate text-[10px] uppercase tracking-wide text-on-surface-variant">
                    {stat.label}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Search */}
          <div className="relative mt-5 max-w-xl" data-tour="help-search">
            <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant">
              search
            </span>
            <input
              id="help-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search guides, FAQs, walkthroughs, and fixes…"
              className="h-11 w-full rounded-lg border border-outline-variant bg-surface pl-10 pr-12 text-sm text-on-surface outline-none transition placeholder:text-on-surface-variant/70 focus:border-primary focus:ring-2 focus:ring-primary/15"
              aria-label="Search help"
            />
            <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 border border-outline-variant bg-surface-container-low px-1.5 py-0.5 text-[10px] font-medium text-on-surface-variant md:inline-block">
              /
            </kbd>
          </div>
        </motion.div>
      </header>

      {/* Search results */}
      {query.trim() && (
        <section className="mb-8 overflow-hidden rounded-2xl border border-outline-variant bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-outline-variant px-4 py-3">
            <div>
              <h2 className="text-sm font-bold text-on-surface">
                Search results
              </h2>
              <p className="text-xs text-on-surface-variant">
                {results.length} match{results.length === 1 ? '' : 'es'} for “
                {query.trim()}”
              </p>
            </div>
            <button
              type="button"
              onClick={() => setQuery('')}
              className="text-xs font-semibold text-primary hover:underline"
            >
              Clear
            </button>
          </div>
          {results.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-on-surface-variant">
              <p>No results for “{query.trim()}”.</p>
              <p className="mt-1 text-xs">
                Try “timetable”, “approval”, “faculty”, or “notifications”.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-outline-variant">
              {results.map((result) => {
                const style = RESULT_STYLES[result.type];
                return (
                  <li key={result.key}>
                    <button
                      type="button"
                      onClick={() => openResult(result.sectionId)}
                      className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-container-low"
                    >
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${style.className}`}
                      >
                        <Icon name={style.icon} size={16} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-on-surface">
                            {result.title}
                          </span>
                          <span className="rounded-full border border-outline-variant px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-on-surface-variant">
                            {result.type}
                          </span>
                        </span>
                        <span className="mt-0.5 block text-xs leading-relaxed text-on-surface-variant">
                          {result.snippet}
                        </span>
                      </span>
                      <Icon
                        name="arrow_forward"
                        size={15}
                        className="mt-1 shrink-0 text-on-surface-variant"
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      <div className="flex flex-col gap-8 lg:flex-row">
        <div
          className="lg:sticky lg:top-6 lg:h-fit lg:w-56 lg:shrink-0"
          data-tour="help-toc"
        >
          <HelpTOC sections={visibleSections} activeId={activeId} />
        </div>

        <div className="flex-1 space-y-12">
          {visibleIds.has('getting-started') && (
            <Reveal>
              <section id="getting-started" className="scroll-mt-24">
                <GettingStarted role={role} />
              </section>
            </Reveal>
          )}
          {visibleIds.has('guided-tours') && (
            <Reveal>
              <section id="guided-tours" className="scroll-mt-24">
                <GuidedTours role={role} />
              </section>
            </Reveal>
          )}
          {visibleIds.has('role-guides') && (
            <Reveal>
              <section id="role-guides" className="scroll-mt-24">
                <RoleGuides role={role} />
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
          {visibleIds.has('commit-history') && (
            <Reveal>
              <section id="commit-history" className="scroll-mt-24">
                <RepoCommitHistory />
              </section>
            </Reveal>
          )}

          {query.trim() && results.length === 0 && (
            <div className="border border-dashed border-outline-variant bg-surface-container-lowest p-8 text-center text-sm text-on-surface-variant">
              No sections match “{query}”.
            </div>
          )}
        </div>
      </div>

      <footer className="mt-16 border-t border-outline-variant pt-6 text-center text-xs text-on-surface-variant">
        <p>
          CoE-NNECT is developed by the{' '}
          <span className="font-medium text-on-surface">
            Department of Computer Engineering
          </span>
          , College of Engineering, Western Mindanao State University.
        </p>
        <p className="mt-1 text-[11px] text-on-surface-variant/80">
          CPE SD 3 — Management Information System · Academic Year 2026–2027
        </p>

        {/* GitHub Repository Link */}
        <div className="mt-5 flex flex-col items-center justify-center gap-2">
          <a
            href="https://github.com/RADENzzz/coe-nnect"
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center gap-2 rounded-lg border border-outline-variant bg-surface px-4 py-2 text-xs font-medium text-on-surface-variant transition-all hover:border-primary/40 hover:text-primary"
          >
            <span className="material-symbols-outlined text-[18px] transition-transform group-hover:scale-110">
              code
            </span>
            View Source on GitHub
            <span className="ml-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-600">
              Open Source
            </span>
          </a>
        </div>

        <StatsEasterEgg onOverlayChange={setOverlayActive} />
      </footer>

      <BackToTop />
    </div>
  );
}
