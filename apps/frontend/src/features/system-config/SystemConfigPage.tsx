import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../store/auth.store';
import {
  fetchSettings,
  updateSettings,
  fetchDesignations,
  createDesignation,
  updateDesignation,
  deleteDesignation,
  type SchedulingSetting,
  type Designation,
} from '../../api/system-config.api';
import Icon from '../../components/ui/Icon';

// ────────────────────────────────────────────
// Field metadata — how each setting is grouped and rendered
// ────────────────────────────────────────────

type FieldType = 'time' | 'number';

interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  hint?: string;
}

interface FieldGroup {
  title: string;
  icon: string;
  description?: string;
  fields: FieldDef[];
}

const GROUPS: FieldGroup[] = [
  {
    title: 'Operating Hours',
    icon: 'schedule',
    description:
      'Daily window during which classes may be scheduled. Default is 7:00 AM – 7:00 PM.',
    fields: [
      {
        key: 'operating_hours_start',
        label: 'Day starts',
        type: 'time',
      },
      {
        key: 'operating_hours_end',
        label: 'Day ends',
        type: 'time',
      },
      {
        key: 'daytime_priority_end_hour',
        label: 'Daytime priority ends',
        type: 'time',
        hint: 'Evening slots after this hour are deprioritized.',
      },
    ],
  },
  {
    title: 'Breaks & Lunch',
    icon: 'restaurant',
    description:
      'Rules for consecutive class limits and the mid-day lunch break.',
    fields: [
      {
        key: 'max_consecutive_hours',
        label: 'Max consecutive hours',
        type: 'number',
        hint: 'Students and faculty cannot exceed this many hours without a break.',
      },
      {
        key: 'min_break_minutes',
        label: 'Min break between classes',
        type: 'number',
        hint: 'Break duration (in minutes) required after consecutive blocks.',
      },
      {
        key: 'lunch_start',
        label: 'Lunch starts',
        type: 'time',
      },
      {
        key: 'lunch_end',
        label: 'Lunch ends',
        type: 'time',
      },
      {
        key: 'lunch_break_minutes',
        label: 'Standard lunch duration',
        type: 'number',
        hint: 'Length of the standard lunch break, in minutes.',
      },
      {
        key: 'lunch_break_overlap_minutes',
        label: 'Overlap threshold',
        type: 'number',
        hint:
          'If a class overlaps lunch by at least this many minutes, the shortened break applies.',
      },
    ],
  },
  {
    title: 'Workload & Release Time',
    icon: 'work_history',
    description:
      'Baseline teaching load and how administrative designations reduce it.',
    fields: [
      {
        key: 'default_required_hours',
        label: 'Default required hours',
        type: 'number',
        hint:
          'Baseline weekly teaching hours for a full-time faculty member (typically 18).',
      },
      {
        key: 'visiting_lecturer_max_hours',
        label: 'Visiting lecturer cap',
        type: 'number',
        hint: 'Maximum weekly hours for visiting lecturers.',
      },
      {
        key: 'release_hours_granularity',
        label: 'Release time granularity',
        type: 'number',
        hint:
          'Release time must be a multiple of this value (typically 3 hours).',
      },
    ],
  },
  {
    title: 'Constraint Engine Tuning',
    icon: 'tune',
    description:
      'Advanced parameters used by the scheduling rules. Change only if you understand the impact.',
    fields: [
      {
        key: 'lab_split_hours',
        label: 'Lab split hours',
        type: 'number',
        hint: 'Duration (in hours) each lab session occupies when a lab is split.',
      },
      {
        key: 'lecture_block_minutes',
        label: 'Standard lecture block (min)',
        type: 'number',
        hint: 'Ideal lecture duration, in minutes (typically 90).',
      },
    ],
  },
];

// ────────────────────────────────────────────
// Page
// ────────────────────────────────────────────

export default function SystemConfigPage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.user_metadata?.role === 'administrator'
    || user?.app_metadata?.role === 'administrator';

  const [draft, setDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const { data: settings = [], isLoading } = useQuery({
    queryKey: ['system-settings'],
    queryFn: fetchSettings,
    enabled: !!user,
  });

  const { data: designations = [] } = useQuery({
    queryKey: ['designations'],
    queryFn: fetchDesignations,
    enabled: !!user,
  });

  // Seed the draft from the fetched settings once
  useEffect(() => {
    if (!settings || settings.length === 0) return;
    const next: Record<string, string> = {};
    for (const s of settings) {
      next[s.settingKey] = String(s.value ?? '');
    }
    setDraft(next);
  }, [settings]);

  const updateMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => updateSettings(payload),
    onSuccess: () => {
      setSuccess('Settings saved.');
      qc.invalidateQueries({ queryKey: ['system-settings'] });
      setTimeout(() => setSuccess(null), 2500);
    },
    onError: (err: any) =>
      setError(
        err?.response?.data?.message ?? err.message ?? 'Failed to save',
      ),
  });

  const handleChange = (key: string, value: string) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setError(null);
  };

  // Determine what actually changed
  const changed = useMemo(() => {
    const out: Record<string, unknown> = {};
    for (const s of settings) {
      const incoming = draft[s.settingKey];
      if (incoming === undefined) continue;
      const original = String(s.value ?? '');
      if (incoming === original) continue;
      // Coerce numbers
      const def = GROUPS.flatMap((g) => g.fields).find(
        (f) => f.key === s.settingKey,
      );
      if (def?.type === 'number') {
        const n = Number(incoming);
        if (Number.isFinite(n)) out[s.settingKey] = n;
      } else {
        out[s.settingKey] = incoming;
      }
    }
    return out;
  }, [draft, settings]);

  const hasChanges = Object.keys(changed).length > 0;

  const handleSave = () => {
    if (!hasChanges) return;
    updateMutation.mutate(changed);
  };

  const handleReset = () => {
    const next: Record<string, string> = {};
    for (const s of settings) next[s.settingKey] = String(s.value ?? '');
    setDraft(next);
    setError(null);
    setSuccess(null);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">
            System Settings
          </h1>
          <p className="text-on-surface-variant text-sm mt-1">
            Configure the rules that govern scheduling for the entire college.
          </p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            {hasChanges && (
              <button
                onClick={handleReset}
                className="px-4 py-2.5 rounded-lg text-sm font-semibold text-on-surface-variant hover:bg-surface-container-low transition"
              >
                Reset
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={!hasChanges || updateMutation.isPending}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-on-primary text-sm font-semibold hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {updateMutation.isPending
                ? 'Saving…'
                : hasChanges
                ? `Save ${Object.keys(changed).length} change${
                    Object.keys(changed).length === 1 ? '' : 's'
                  }`
                : 'Save Changes'}
            </button>
          </div>
        )}
      </div>

      {!isAdmin && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex items-start gap-2">
          <Icon name="info" size={18} className="shrink-0 mt-0.5" />
          <span>
            Read-only view. Only administrators can change system settings.
          </span>
        </div>
      )}

      {error && (
        <div className="p-3 rounded-lg bg-red-100 border border-red-300 text-red-700 text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="p-3 rounded-lg bg-green-100 border border-green-300 text-green-700 text-sm">
          {success}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 text-on-surface-variant">
          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          Loading settings…
        </div>
      ) : (
        <div className="space-y-5">
          {GROUPS.map((group) => (
            <section
              key={group.title}
              className="rounded-xl border border-surface-variant bg-surface-container-lowest overflow-hidden"
            >
              <header className="flex items-start gap-3 px-5 py-4 border-b border-surface-variant bg-surface-container-low">
                <Icon
                  name={group.icon}
                  size={20}
                  className="text-primary mt-0.5 shrink-0"
                />
                <div>
                  <h2 className="text-sm font-bold text-on-surface uppercase tracking-wider">
                    {group.title}
                  </h2>
                  {group.description && (
                    <p className="text-xs text-on-surface-variant mt-1">
                      {group.description}
                    </p>
                  )}
                </div>
              </header>
              <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                {group.fields.map((field) => {
                  const value = draft[field.key] ?? '';
                  const missing =
                    !settings.some((s) => s.settingKey === field.key);
                  return (
                    <div key={field.key}>
                      <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
                        {field.label}
                      </label>
                      <input
                        type={field.type === 'time' ? 'time' : 'number'}
                        min={field.type === 'number' ? 0 : undefined}
                        value={value}
                        disabled={!isAdmin}
                        onChange={(e) =>
                          handleChange(field.key, e.target.value)
                        }
                        className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-sm text-on-surface focus:outline-none focus:border-primary disabled:opacity-60 disabled:cursor-not-allowed"
                      />
                      {field.hint && (
                        <p className="text-[11px] text-on-surface-variant mt-1">
                          {field.hint}
                        </p>
                      )}
                      {missing && (
                        <p className="text-[11px] text-amber-700 mt-1">
                          Not yet configured — a default is used by the engine.
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      <DesignationsPanel
        designations={designations}
        isAdmin={isAdmin}
        onChanged={() => qc.invalidateQueries({ queryKey: ['designations'] })}
      />
    </div>
  );
}

// ────────────────────────────────────────────
// Designations panel — FR 7.1.4
// ────────────────────────────────────────────

function DesignationsPanel({
  designations,
  isAdmin,
  onChanged,
}: {
  designations: Designation[];
  isAdmin: boolean;
  onChanged: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', hours: '' });

  const createMutation = useMutation({
    mutationFn: createDesignation,
    onSuccess: () => {
      setForm({ name: '', hours: '' });
      onChanged();
    },
    onError: (err: any) =>
      setError(err?.response?.data?.message ?? 'Failed to create'),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteDesignation,
    onSuccess: onChanged,
    onError: (err: any) =>
      setError(err?.response?.data?.message ?? 'Failed to delete'),
  });

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const name = form.name.trim();
    const hours = Number(form.hours);
    if (!name || !Number.isFinite(hours)) return;
    if (hours % 3 !== 0) {
      setError('Release time must be a multiple of 3 hours.');
      return;
    }
    createMutation.mutate({ designationName: name, releaseHours: hours });
  };

  return (
    <section className="rounded-xl border border-surface-variant bg-surface-container-lowest overflow-hidden">
      <header className="flex items-start gap-3 px-5 py-4 border-b border-surface-variant bg-surface-container-low">
        <Icon name="badge" size={20} className="text-primary mt-0.5 shrink-0" />
        <div>
          <h2 className="text-sm font-bold text-on-surface uppercase tracking-wider">
            Designations & Release Time
          </h2>
          <p className="text-xs text-on-surface-variant mt-1">
            Administrative designations grant release time that reduces
            required weekly teaching hours. Release time is granted in
            multiples of 3 hours.
          </p>
        </div>
      </header>

      <div className="p-5 space-y-4">
        {error && (
          <div className="p-3 rounded-lg bg-red-100 border border-red-300 text-red-700 text-sm">
            {error}
          </div>
        )}

        {isAdmin && (
          <form
            onSubmit={handleAdd}
            className="flex flex-wrap items-end gap-3 p-4 rounded-lg border border-surface-variant bg-surface-container-low"
          >
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
                Designation Name
              </label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) =>
                  setForm((p) => ({ ...p, name: e.target.value }))
                }
                placeholder="e.g. Program Coordinator"
                className="w-full bg-surface-container-lowest border border-surface-variant rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div className="w-40">
              <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
                Release (hrs)
              </label>
              <input
                type="number"
                required
                min={0}
                step={3}
                value={form.hours}
                onChange={(e) =>
                  setForm((p) => ({ ...p, hours: e.target.value }))
                }
                placeholder="e.g. 3"
                className="w-full bg-surface-container-lowest border border-surface-variant rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-on-primary text-sm font-semibold hover:opacity-90 transition disabled:opacity-50"
            >
              <Icon name="add" size={16} />
              {createMutation.isPending ? 'Adding…' : 'Add'}
            </button>
          </form>
        )}

        <div className="rounded-lg border border-surface-variant overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-variant text-on-surface-variant text-xs uppercase tracking-wider bg-surface-container-low">
                <th className="text-left px-4 py-2.5">Designation</th>
                <th className="text-left px-4 py-2.5">Release Time</th>
                <th className="text-left px-4 py-2.5">Required Weekly Hours</th>
                {isAdmin && <th className="text-right px-4 py-2.5">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {designations.length === 0 ? (
                <tr>
                  <td
                    colSpan={isAdmin ? 4 : 3}
                    className="px-4 py-8 text-center text-on-surface-variant"
                  >
                    No designations configured.
                  </td>
                </tr>
              ) : (
                designations.map((d) => {
                  const required = 18 - Number(d.releaseHours);
                  return (
                    <tr
                      key={d.designationId}
                      className="border-b border-white/5 hover:bg-surface-container-low"
                    >
                      <td className="px-4 py-3 font-medium text-on-surface">
                        {d.designationName}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-on-surface-variant">
                        {Number(d.releaseHours)} hrs
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-on-surface-variant">
                        {required} hrs / week
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => {
                              if (
                                window.confirm(
                                  `Delete designation "${d.designationName}"?`,
                                )
                              ) {
                                deleteMutation.mutate(d.designationId);
                              }
                            }}
                            disabled={deleteMutation.isPending}
                            className="text-xs px-3 py-1 rounded-lg border border-red-300 text-red-700 hover:bg-red-100 transition"
                          >
                            Delete
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-on-surface-variant">
          Required weekly hours = 18 baseline − release time. Faculty with
          designations are flagged as overloaded once they exceed this figure.
        </p>
      </div>
    </section>
  );
}