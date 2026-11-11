import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../store/auth.store';
import {
  fetchSettings,
  updateSettings,
  fetchDesignations,
  createDesignation,
  deleteDesignation,
  type Designation,
} from '../../api/system-config.api';
import Icon from '../../components/ui/Icon';
import TermsPanel from './components/TermsPanel';
import Modal from '../../components/ui/Modal';
import { useFeedback } from '../../components/ui/FeedbackToast';

// ────────────────────────────────────────────
// Field metadata — how each setting is grouped and rendered
// ────────────────────────────────────────────

type FieldType = 'time' | 'number';

interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  hint?: string;
  /** Suffix shown beside numeric defaults, e.g. "minutes". */
  unit?: string;
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
        unit: 'hours',
        hint: 'Students and faculty cannot exceed this many hours without a break.',
      },
      {
        key: 'min_break_minutes',
        label: 'Min break between classes',
        type: 'number',
        unit: 'minutes',
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
        unit: 'minutes',
        hint: 'Length of the standard lunch break, in minutes.',
      },
      {
        key: 'lunch_break_overlap_minutes',
        label: 'Overlap threshold',
        type: 'number',
        unit: 'minutes',
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
        unit: 'hours/week',
        hint:
          'Baseline weekly teaching hours for a full-time faculty member (typically 18).',
      },
      {
        key: 'visiting_lecturer_max_hours',
        label: 'Visiting lecturer cap',
        type: 'number',
        unit: 'hours/week',
        hint: 'Maximum weekly hours for visiting lecturers.',
      },
      {
        key: 'release_hours_granularity',
        label: 'Release time granularity',
        type: 'number',
        unit: 'hours',
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
        unit: 'hours',
        hint: 'Duration (in hours) each lab session occupies when a lab is split.',
      },
      {
        key: 'lecture_block_minutes',
        label: 'Standard lecture block (min)',
        type: 'number',
        unit: 'minutes',
        hint: 'Ideal lecture duration, in minutes (typically 90).',
      },
      {
        key: 'end_hour_alignment_weight',
        label: 'Prefer hour-aligned block ends',
        type: 'number',
        hint:
          '0 = off. Higher values nudge blocks to END on the hour ' +
          '(e.g. a block ending 12:30 → prefers 12:00). Starts may still ' +
          'sit on a half-hour. Suggested 3–5 when enabled.',
      },
    ],
  },
];

// ────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────

const ALL_FIELDS = GROUPS.flatMap((group) => group.fields);

function formatTimeLabel(value: string): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(value);
  if (!match) return value;
  const hours = Number(match[1]);
  const minutes = match[2];
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const displayHour = hours % 12 || 12;
  return `${displayHour}:${minutes} ${suffix}`;
}

function formatDefaultValue(
  field: FieldDef,
  value: string | number | undefined,
): string {
  if (value === undefined || value === null || value === '') return '—';
  if (field.type === 'time') return formatTimeLabel(String(value));
  return `${value}${field.unit ? ` ${field.unit}` : ''}`;
}

function apiErrorMessage(err: any, fallback: string): string {
  const message = err?.response?.data?.message;
  if (Array.isArray(message)) return message.join(' ');
  if (typeof message === 'string' && message.trim()) return message;
  if (typeof err?.message === 'string' && err.message.trim()) {
    return err.message;
  }
  return fallback;
}

// ────────────────────────────────────────────
// Page
// ────────────────────────────────────────────

export default function SystemConfigPage() {
  const qc = useQueryClient();
  const feedback = useFeedback();
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  // After the Admin→Dean consolidation, both the dev account and the
  // College Dean can write system settings.
  const isAdmin =
    profile?.role === 'administrator' || profile?.role === 'college_dean';

  const [draft, setDraft] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: ['system-settings'],
    queryFn: fetchSettings,
    enabled: !!user,
  });

  const settings = useMemo(() => data?.settings ?? [], [data]);
  const defaults = useMemo(() => data?.defaults ?? {}, [data]);

  const { data: designations = [] } = useQuery({
    queryKey: ['designations'],
    queryFn: fetchDesignations,
    enabled: !!user,
  });

  const persistedByKey = useMemo(
    () => new Map(settings.map((setting) => [setting.settingKey, setting])),
    [settings],
  );

  const savedValue = useCallback(
    (key: string): string => {
      const persisted = persistedByKey.get(key);
      if (persisted) return String(persisted.value ?? '');
      const fallback = defaults[key];
      return fallback === undefined || fallback === null
        ? ''
        : String(fallback);
    },
    [persistedByKey, defaults],
  );

  // Build a draft from persisted values, falling back to engine defaults for
  // keys that have never been saved. Every field is therefore populated.
  const seedDraft = useCallback(() => {
    const next: Record<string, string> = {};
    for (const field of ALL_FIELDS) {
      next[field.key] = savedValue(field.key);
    }
    return next;
  }, [savedValue]);

  // Seed once per mount. Reseeding on every background refetch would throw
  // away edits the user has not saved yet. "Discard changes" reseeds
  // explicitly from the latest server snapshot.
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current || !data) return;
    setDraft(seedDraft());
    seededRef.current = true;
  }, [data, seedDraft]);

  const updateMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => updateSettings(payload),
    onSuccess: (_data, variables) => {
      const count = Object.keys(variables).length;
      feedback.success(
        `${count} setting${count === 1 ? '' : 's'} saved.`,
        { title: 'Settings saved' },
      );
      qc.invalidateQueries({ queryKey: ['system-settings'] });
    },
    onError: (err: any) =>
      feedback.failed(apiErrorMessage(err, 'The server rejected the update.'), {
        title: 'Could not save settings',
      }),
  });

  const handleChange = (key: string, value: string) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  // Determine what actually changed, including fields that were previously
  // absent and are now being set to something other than their default.
  const changed = useMemo(() => {
    const out: Record<string, unknown> = {};
    for (const field of ALL_FIELDS) {
      const incoming = draft[field.key];
      if (incoming === undefined) continue;
      if (incoming === savedValue(field.key)) continue;

      if (field.type === 'number') {
        const n = Number(incoming);
        if (incoming.trim() !== '' && Number.isFinite(n)) {
          out[field.key] = n;
        }
      } else if (incoming.trim() !== '') {
        out[field.key] = incoming;
      }
    }
    return out;
  }, [draft, savedValue]);

  const hasChanges = Object.keys(changed).length > 0;

  const handleSave = () => {
    if (!hasChanges || updateMutation.isPending) return;
    updateMutation.mutate(changed);
  };

  const handleDiscard = () => {
    setDraft(seedDraft());
  };

  const handleResetField = (field: FieldDef) => {
    const fallback = defaults[field.key];
    if (fallback === undefined || fallback === null) return;
    setDraft((prev) => ({ ...prev, [field.key]: String(fallback) }));
  };

  const handleResetAll = () => {
    const next = { ...draft };
    for (const field of ALL_FIELDS) {
      const fallback = defaults[field.key];
      if (fallback !== undefined && fallback !== null) {
        next[field.key] = String(fallback);
      }
    }
    setDraft(next);
  };

  const baselineHours = useMemo(() => {
    const value = Number(
      draft.default_required_hours ?? defaults.default_required_hours ?? 18,
    );
    return Number.isFinite(value) && value > 0 ? value : 18;
  }, [draft.default_required_hours, defaults.default_required_hours]);

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-start justify-between gap-3 flex-wrap" data-tour="sysconfig-header">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">
            System Settings
          </h1>
          <p className="text-on-surface-variant text-sm mt-1">
            Configure the rules that govern scheduling for the entire college.
          </p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleResetAll}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-semibold text-on-surface-variant hover:bg-surface-container-low transition"
              title="Set every field to its engine default, then review and save"
            >
              <Icon name="restart_alt" size={16} />
              Reset all to defaults
            </button>
            {hasChanges && (
              <button
                onClick={handleDiscard}
                className="px-4 py-2.5 rounded-lg text-sm font-semibold text-on-surface-variant hover:bg-surface-container-low transition"
              >
                Discard changes
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
            Read-only view. Only the College Dean can change system settings.
          </span>
        </div>
      )}

      {/* Academic Terms — FR 7.1.4 */}
      <div data-tour="sysconfig-terms">
        <TermsPanel isAdmin={isAdmin} />
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-on-surface-variant">
          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          Loading settings…
        </div>
      ) : (
        <div className="space-y-5" data-tour="sysconfig-groups">
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
                  const persisted = persistedByKey.get(field.key);
                  const defaultValue = defaults[field.key];
                  const defaultString =
                    defaultValue === undefined || defaultValue === null
                      ? ''
                      : String(defaultValue);
                  const usingDefault =
                    defaultString !== '' && value === defaultString;
                  return (
                    <div key={field.key}>
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
                          {field.label}
                        </label>
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => handleResetField(field)}
                            disabled={usingDefault || defaultString === ''}
                            title={
                              usingDefault
                                ? 'Already using the default'
                                : `Reset to ${formatDefaultValue(
                                    field,
                                    defaultValue,
                                  )}`
                            }
                            className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary transition hover:bg-primary/10 disabled:cursor-default disabled:text-on-surface-variant/40 disabled:hover:bg-transparent"
                          >
                            <Icon name="restart_alt" size={12} />
                            Reset
                          </button>
                        )}
                      </div>
                      <input
                        type={field.type === 'time' ? 'time' : 'number'}
                        min={field.type === 'number' ? 0 : undefined}
                        step={field.type === 'number' ? 1 : undefined}
                        value={value}
                        disabled={!isAdmin}
                        onChange={(e) =>
                          handleChange(field.key, e.target.value)
                        }
                        className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-sm text-on-surface focus:outline-none focus:border-primary disabled:opacity-60 disabled:cursor-not-allowed"
                      />
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="text-[11px] text-on-surface-variant">
                          Default:{' '}
                          <span className="font-semibold text-on-surface">
                            {formatDefaultValue(field, defaultValue)}
                          </span>
                        </p>
                        {!persisted && (
                          <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                            Not yet saved
                          </span>
                        )}
                        {persisted && !usingDefault && (
                          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                            Custom
                          </span>
                        )}
                      </div>
                      {field.hint && (
                        <p className="text-[11px] text-on-surface-variant mt-1">
                          {field.hint}
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
        baselineHours={baselineHours}
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
  baselineHours,
  onChanged,
}: {
  designations: Designation[];
  isAdmin: boolean;
  baselineHours: number;
  onChanged: () => void;
}) {
  const feedback = useFeedback();
  const [form, setForm] = useState({ name: '', hours: '' });
  const [deleteTarget, setDeleteTarget] = useState<Designation | null>(null);

  const createMutation = useMutation({
    mutationFn: createDesignation,
    onSuccess: (created) => {
      feedback.success(
        `${created.designationName} now grants ${Number(
          created.releaseHours,
        )} hours of release time.`,
        { title: 'Designation added' },
      );
      setForm({ name: '', hours: '' });
      onChanged();
    },
    onError: (err: any) =>
      feedback.failed(apiErrorMessage(err, 'The designation was not created.'), {
        title: 'Could not add designation',
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteDesignation,
    onSuccess: (_data, id) => {
      const removed = designations.find((d) => d.designationId === id);
      feedback.success(
        removed
          ? `"${removed.designationName}" was removed.`
          : 'The designation was removed.',
        { title: 'Designation deleted' },
      );
      onChanged();
    },
    onError: (err: any) =>
      feedback.failed(apiErrorMessage(err, 'The designation was not deleted.'), {
        title: 'Could not delete designation',
      }),
  });

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const name = form.name.trim();
    const hours = Number(form.hours);
    if (!name || form.hours.trim() === '' || !Number.isFinite(hours)) {
      feedback.error('Enter a designation name and release hours.', {
        title: 'Missing details',
      });
      return;
    }
    if (hours < 0 || hours % 3 !== 0) {
      feedback.error('Release time must be a non-negative multiple of 3 hours.', {
        title: 'Invalid release time',
      });
      return;
    }
    createMutation.mutate({ designationName: name, releaseHours: hours });
  };

  return (
    <>
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
                    const required = Math.max(
                      0,
                      baselineHours - Number(d.releaseHours),
                    );
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
                              onClick={() => setDeleteTarget(d)}
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
            Required weekly hours = {baselineHours} baseline − release time. Faculty with
            designations are flagged as overloaded once they exceed this figure.
          </p>
        </div>
      </section>

      {/* Delete designation modal */}
      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete designation?"
        size="sm"
        footer={
          <>
            <button
              type="button"
              onClick={() => setDeleteTarget(null)}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                if (deleteTarget) {
                  deleteMutation.mutate(deleteTarget.designationId);
                  setDeleteTarget(null);
                }
              }}
              disabled={deleteMutation.isPending}
              className="px-4 py-2 text-sm font-semibold bg-red-600 text-white hover:bg-red-700 transition disabled:opacity-50"
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          Delete <strong>"{deleteTarget?.designationName}"</strong>? Any
          faculty member with this designation will have their release time
          removed. This cannot be undone.
        </p>
      </Modal>
    </>
  );
}