import { useState, useRef } from 'react';
import { motion } from 'motion/react';
import { TeamCard } from '../components/TeamCard';
import { TEAM_GROUPS, CLIENT } from '../data/team';
import { SpotlightCard } from '../components/animations';
import { useEasterEggStore } from '../store/easter-egg.store';
import {
  Achievement,
  type AchievementData,
} from '../components/Achievement';
import { ACHIEVEMENTS } from '../lib/sfx';

export function TeamInfo() {
  const registerTap = useEasterEggStore((s) => s.registerTap);
  const taps = useEasterEggStore((s) => s.taps);

  // The last achievement shown on screen. Null = none.
  const [achievement, setAchievement] = useState<AchievementData | null>(null);

  // Guard so the same achievement doesn't re-fire within a session.
  const unlockedRef = useRef<Set<string>>(new Set());

  const handleAchievement = (id: string) => {
    if (unlockedRef.current.has(id)) return;
    unlockedRef.current.add(id);

    // Look up the definition and show the popup.
    const def =
      id === ACHIEVEMENTS.WILHELM.id
        ? { ...ACHIEVEMENTS.WILHELM }
        : null;
    if (!def) return;
    setAchievement(def as AchievementData);
  };

  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold text-slate-900">About the Team</h2>
      <p className="mb-8 text-sm leading-relaxed text-slate-700">
        CoE-NNECT is developed by a multidisciplinary team from the College of
        Engineering, Western Mindanao State University, in collaboration with
        the project client.
      </p>

      <div className="space-y-8">
        {TEAM_GROUPS.map((group, groupIdx) => (
          <motion.div
            key={group.id}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.5, delay: groupIdx * 0.08 }}
          >
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {group.label}
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  {group.description}
                </p>
              </div>
              <span className="shrink-0 text-[10px] font-medium uppercase tracking-wider text-slate-400">
                {group.members.length} member
                {group.members.length === 1 ? '' : 's'}
              </span>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {group.members.map((m, i) => {
                const isEasterEgg = m.name === 'Alrhaden A. Javier';
                return (
                  <TeamCard
                    key={m.name}
                    member={m}
                    index={i}
                    onTap={isEasterEgg ? () => registerTap() : undefined}
                    storeTaps={isEasterEgg ? taps : undefined}
                    onAchievement={handleAchievement}
                  />
                );
              })}
            </div>
          </motion.div>
        ))}

        {/* Client */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <SpotlightCard className="border border-brand-200 bg-gradient-to-br from-brand-50 to-white p-5">
            <div className="mb-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] text-brand-700">
                handshake
              </span>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-brand-800">
                Project Client
              </h3>
            </div>
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-700 text-base font-semibold text-white">
                {CLIENT.initials}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-base font-semibold text-slate-900">
                  {CLIENT.name}
                </div>
                <div className="text-xs text-slate-500">{CLIENT.role}</div>
                <div className="mt-1 text-xs text-slate-600">{CLIENT.focus}</div>
              </div>
            </div>
          </SpotlightCard>
        </motion.div>
      </div>

      {/* Achievement popup */}
      <Achievement
        achievement={achievement}
        onDismiss={() => setAchievement(null)}
      />
    </div>
  );
}