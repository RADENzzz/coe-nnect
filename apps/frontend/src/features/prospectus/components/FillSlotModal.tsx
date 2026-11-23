import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Icon from '@/components/ui/Icon';
import Modal from '@/components/ui/Modal';
import { fetchSubjects, type SubjectRecord } from '@/api/subjects.api';

export interface FillSlotValue {
  subjectId?: string;
  newSubjectCode?: string;
  newSubjectTitle?: string;
}

interface FillSlotModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (value: FillSlotValue) => void;
  slotLabel: string;
  programId: string;
  yearLevel?: number | null;
  semester?: string | null;
  isPending: boolean;
}

type FillMode = 'existing' | 'typed';

function electiveOptionLabel(s: SubjectRecord): string {
  const code = s.subjectCode?.trim();
  const prefix = code ? `[${code}] ` : '';
  const year = s.electiveYearLevel
    ? `Year ${s.electiveYearLevel}`
    : 'Any year';
  const term =
    s.electiveSemester === 'summer'
      ? 'Summer'
      : s.electiveSemester
      ? `${s.electiveSemester} sem`
      : 'Any term';
  return `${prefix}${s.title} · ${year} · ${term}`;
}

export default function FillSlotModal({
  open,
  onClose,
  onConfirm,
  slotLabel,
  programId,
  yearLevel,
  semester,
  isPending,
}: FillSlotModalProps) {
  const [mode, setMode] = useState<FillMode>('existing');
  const [selectedId, setSelectedId] = useState('');
  const [typedCode, setTypedCode] = useState('');
  const [typedTitle, setTypedTitle] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [semesterFilter, setSemesterFilter] = useState('');

  // Reset filters/selection each time the modal opens, pre-filtering to the
  // slot's year/term so the most likely electives are shown first.
  useEffect(() => {
    if (!open) return;
    setMode('existing');
    setSelectedId('');
    setTypedCode('');
    setTypedTitle(slotLabel);
    setCategoryFilter('');
    setYearFilter(yearLevel != null ? String(yearLevel) : '');
    setSemesterFilter(semester ?? '');
  }, [open, yearLevel, semester, slotLabel]);

  const { data: subjects = [], isLoading } = useQuery({
    queryKey: ['subjects', { forProgram: programId, active: true }],
    queryFn: () => fetchSubjects(),
    enabled: open,
  });

  // Only active electives can fill an elective slot. Placeholders are hidden:
  // they are empty fields, not catalog electives.
  const electives = useMemo(
    () =>
      subjects.filter(
        (s) => s.isActive && !s.isPlaceholder && s.isElective,
      ),
    [subjects],
  );

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const s of electives) {
      const category = s.electiveCategory?.trim();
      if (category) set.add(category);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [electives]);

  const filtered = useMemo(() => {
    return electives.filter((s) => {
      const category = (s.electiveCategory ?? '').trim();
      if (categoryFilter === '__none__') {
        if (category) return false;
      } else if (categoryFilter) {
        if (category.toLowerCase() !== categoryFilter.toLowerCase()) {
          return false;
        }
      }

      // A missing year/term means "any" and stays eligible for every filter.
      if (yearFilter === 'none') {
        if (s.electiveYearLevel != null) return false;
      } else if (
        yearFilter &&
        s.electiveYearLevel != null &&
        String(s.electiveYearLevel) !== yearFilter
      ) {
        return false;
      }

      if (semesterFilter === 'none') {
        if (s.electiveSemester != null) return false;
      } else if (
        semesterFilter &&
        s.electiveSemester != null &&
        s.electiveSemester !== semesterFilter
      ) {
        return false;
      }

      return true;
    });
  }, [electives, categoryFilter, yearFilter, semesterFilter]);

  const groups = useMemo(() => {
    const map = new Map<string, SubjectRecord[]>();
    for (const s of filtered) {
      const key = s.electiveCategory?.trim() ?? '';
      const items = map.get(key) ?? [];
      items.push(s);
      map.set(key, items);
    }
    return [...map.entries()]
      .sort(([a], [b]) => {
        if (!a) return 1;
        if (!b) return -1;
        return a.localeCompare(b);
      })
      .map(([category, items]) => ({
        category,
        items: [...items].sort((a, b) =>
          (a.subjectCode || a.title).localeCompare(b.subjectCode || b.title),
        ),
      }));
  }, [filtered]);

  // Drop a selection that the active filters have hidden.
  useEffect(() => {
    if (!selectedId) return;
    if (!filtered.some((s) => String(s.subjectId) === selectedId)) {
      setSelectedId('');
    }
  }, [filtered, selectedId]);

  const typedCodeValid = typedCode.trim().length > 0;
  const canConfirm =
    mode === 'existing' ? !!selectedId : typedCodeValid;

  const handleConfirm = () => {
    if (mode === 'existing') {
      if (selectedId) onConfirm({ subjectId: selectedId });
      return;
    }
    const code = typedCode.trim();
    if (!code) return;
    onConfirm({
      newSubjectCode: code,
      ...(typedTitle.trim() ? { newSubjectTitle: typedTitle.trim() } : {}),
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Fill Elective Slot"
      size="md"
      footer={
        <>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm || isPending}
            className="px-4 py-2 text-sm font-semibold bg-primary text-on-primary hover:opacity-90 transition rounded-lg flex items-center gap-2 disabled:opacity-50"
          >
            {isPending && (
              <Icon name="progress_activity" size={14} className="animate-spin" />
            )}
            {isPending
              ? 'Saving…'
              : mode === 'typed'
              ? 'Create & Fill'
              : 'Assign Subject'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-900">
          You are filling the empty elective field:{' '}
          <strong>{slotLabel}</strong>
        </div>

        <div className="flex rounded-lg border border-surface-variant overflow-hidden">
          <button
            type="button"
            onClick={() => setMode('existing')}
            className={`flex-1 px-3 py-2 text-xs font-semibold transition ${
              mode === 'existing'
                ? 'bg-primary text-on-primary'
                : 'bg-surface-container-low text-slate-600 hover:bg-surface-container-high'
            }`}
          >
            Choose existing elective
          </button>
          <button
            type="button"
            onClick={() => setMode('typed')}
            className={`flex-1 px-3 py-2 text-xs font-semibold transition ${
              mode === 'typed'
                ? 'bg-primary text-on-primary'
                : 'bg-surface-container-low text-slate-600 hover:bg-surface-container-high'
            }`}
          >
            Type a new code
          </button>
        </div>

        {mode === 'existing' ? (
          <>
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <Icon name="stars" size={14} className="text-teal-600" />
                <span className="text-xs font-semibold text-on-surface uppercase tracking-wider">
                  Elective filters
                </span>
                <span className="text-[10px] text-on-surface-variant">
                  {filtered.length} of {electives.length} available
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <label className="block text-[10px] font-semibold text-on-surface-variant mb-1 uppercase tracking-wider">
                    Category
                  </label>
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:border-primary"
                  >
                    <option value="">All categories</option>
                    <option value="__none__">Uncategorized</option>
                    {categories.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-semibold text-on-surface-variant mb-1 uppercase tracking-wider">
                    Year level
                  </label>
                  <select
                    value={yearFilter}
                    onChange={(e) => setYearFilter(e.target.value)}
                    className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:border-primary"
                  >
                    <option value="">All year levels</option>
                    <option value="1">Year 1</option>
                    <option value="2">Year 2</option>
                    <option value="3">Year 3</option>
                    <option value="4">Year 4</option>
                    <option value="none">Unassigned</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-semibold text-on-surface-variant mb-1 uppercase tracking-wider">
                    Term
                  </label>
                  <select
                    value={semesterFilter}
                    onChange={(e) => setSemesterFilter(e.target.value)}
                    className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:border-primary"
                  >
                    <option value="">All terms</option>
                    <option value="1st">1st semester</option>
                    <option value="2nd">2nd semester</option>
                    <option value="summer">Summer</option>
                    <option value="none">Unassigned</option>
                  </select>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
                Select an Elective Subject
              </label>
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                disabled={isLoading}
              >
                <option value="">— Select an elective —</option>
                {groups.map((group) => (
                  <optgroup
                    key={group.category || '__uncategorized__'}
                    label={group.category || 'Uncategorized'}
                  >
                    {group.items.map((s) => (
                      <option key={s.subjectId} value={s.subjectId}>
                        {electiveOptionLabel(s)}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <p className="text-[11px] text-on-surface-variant mt-2 flex items-center gap-1.5">
                <Icon name="info" size={11} />
                Only active elective subjects are shown, grouped by category.
              </p>
              {!isLoading && filtered.length === 0 && (
                <div className="mt-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-start gap-2">
                  <Icon name="warning" size={14} className="shrink-0 mt-0.5" />
                  <span>
                    No electives match these filters. Switch to{' '}
                    <strong>Type a new code</strong> to create one now.
                  </span>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
                New Course Code
              </label>
              <input
                type="text"
                value={typedCode}
                onChange={(e) => setTypedCode(e.target.value)}
                placeholder="e.g. CPE SD 1"
                autoFocus
                className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
                Title
              </label>
              <input
                type="text"
                value={typedTitle}
                onChange={(e) => setTypedTitle(e.target.value)}
                placeholder="Course title"
                className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
              />
            </div>

            <div className="p-3 rounded-lg bg-teal-50 border border-teal-200 text-xs text-teal-900 flex items-start gap-2">
              <Icon name="info" size={14} className="shrink-0 mt-0.5" />
              <span>
                The code is saved to the elective catalog automatically. Units
                and elective metadata are inherited from this empty field, and
                the field is filled immediately.
              </span>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
