import { useState, useEffect, useRef } from 'react';
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
import { useUiStore } from '../../store/ui.store';

const SECTIONS = [
  { id: 'getting-started',  label: 'Getting Started' },
  { id: 'role-guides',      label: 'Role Guides' },
  { id: 'walkthroughs',     label: 'Feature Walkthroughs' },
  { id: 'faq',              label: 'FAQ' },
  { id: 'troubleshooting',  label: 'Troubleshooting' },
  { id: 'team',             label: 'About the Team' },
  { id: 'version',          label: 'Version Info' },
];

export default function HelpPage() {
  const profile = useAuthStore((s) => s.profile);
  const [activeId, setActiveId] = useState<string>('getting-started');
  const [discoActive, setDiscoActive] = useState(false);

  // ── Sidebar control ──
  const isSidebarCollapsed = useUiStore((s) => s.isSidebarCollapsed);
  const setSidebarCollapsed = useUiStore((s) => s.setSidebarCollapsed);

  // Remember what the sidebar was before disco activated
  const prevCollapsedRef = useRef<boolean>(isSidebarCollapsed);

  // ── Collapse sidebar while disco is active; restore after ──
  useEffect(() => {
    if (discoActive) {
      prevCollapsedRef.current = isSidebarCollapsed;
      setSidebarCollapsed(true);
    } else {
      setSidebarCollapsed(prevCollapsedRef.current);
    }
    // We intentionally exclude isSidebarCollapsed/setSidebarCollapsed —
    // only discoActive should trigger the state change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discoActive]);

  useEffect(() => {
    if (discoActive) return;
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
  }, [discoActive]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-10">
      <header className="animate-fade-up mb-8">
        <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-brand-700">
          <span className="material-symbols-outlined text-[16px]">help_outline</span>
          Help &amp; Documentation
        </div>
        <h1 className="text-2xl font-semibold text-slate-900 md:text-3xl">
          Welcome to CoE-NNECT Help
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          Everything you need to use the College of Engineering Scheduling System.
          Browse feature walkthroughs, FAQs, and team information below.
        </p>
      </header>

      <div className="flex flex-col gap-8 lg:flex-row">
        <HelpTOC
          sections={SECTIONS}
          activeId={activeId}
          className="lg:sticky lg:top-6 lg:h-fit lg:w-56 lg:shrink-0"
        />

        <div className="flex-1 space-y-12">
          <section id="getting-started">
            <GettingStarted role={profile?.role ?? null} />
          </section>
          <section id="role-guides">
            <RoleGuides role={profile?.role ?? null} />
          </section>
          <section id="walkthroughs">
            <FeatureWalkthroughs />
          </section>
          <section id="faq">
            <FAQ />
          </section>
          <section id="troubleshooting">
            <Troubleshooting />
          </section>
          <section id="team">
            <TeamInfo />
          </section>
          <section id="version">
            <VersionInfo />
          </section>
        </div>
      </div>

      <div className="animate-fade-up mt-16 border-t border-slate-200 pt-6 text-center text-xs text-slate-500">
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

        {/* Easter egg — reports disco state up */}
        <StatsEasterEgg onDiscoChange={setDiscoActive} />
      </div>
    </div>
  );
}