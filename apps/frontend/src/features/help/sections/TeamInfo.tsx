import { TeamCard } from '../components/TeamCard';
import { TEAM_GROUPS, CLIENT } from '../data/team';
import {
  EASTER_EGG_TOTAL_TAPS,
  useEasterEggStore,
} from '../store/easter-egg.store';

export function TeamInfo() {
  const registerTap = useEasterEggStore((s) => s.registerTap);
  const taps = useEasterEggStore((s) => s.taps);

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
          <div
            key={group.id}
            className="animate-fade-up"
            style={{
              animationDelay: `${groupIdx * 100}ms`,
              animationFillMode: 'both',
            }}
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
              {group.members.map((m, i) => (
                <TeamCard
                  key={m.name}
                  member={m}
                  index={i}
                  // ⭐ Easter egg trigger on Alrhaden's card only
                  onTap={
                    m.name === 'Alrhaden A. Javier'
                      ? () => registerTap()
                      : undefined
                  }
                  remainingSteps={
                    m.name === 'Alrhaden A. Javier' && taps > 0
                      ? EASTER_EGG_TOTAL_TAPS - taps
                      : null
                  }
                />
              ))}
            </div>
          </div>
        ))}

        {/* Client — highlighted separately */}
        <div
          className="animate-fade-up border border-brand-200 bg-gradient-to-br from-brand-50 to-white p-5"
          style={{ animationDelay: '500ms', animationFillMode: 'both' }}
        >
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
        </div>

        {/* Department attribution */}
        <div
          className="animate-fade-up mt-8 border-t border-slate-200 pt-6 text-center text-xs text-slate-500"
          style={{ animationDelay: '600ms', animationFillMode: 'both' }}
        >
          <p>
            Developed under the{' '}
            <span className="font-medium text-slate-700">
              Department of Computer Engineering
            </span>
            <br />
            College of Engineering · Western Mindanao State University
          </p>
          <p className="mt-2 text-[11px] text-slate-400">
            CPE SD 3 — Management Information System · Academic Year 2026–2027
          </p>
        </div>
      </div>
    </div>
  );
}