import Icon from '../../../components/ui/Icon';
import type { Department } from '../../../api/departments.api';
import type { RoomRecord } from '../../../api/rooms.api';
import {
  ROOM_TYPES,
  TYPE_ICON,
  TYPE_ACCENT,
  FormSection,
  FormField,
  OwnershipOption,
  inputClass,
  type FormState,
  type FieldErrors,
} from './RoomFormFields';

interface StepProps {
  form: FormState;
  setField: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  fieldErrors: FieldErrors;
}

// ── Step 1: Basics ──
export function BasicsStep({
  form,
  setField,
  fieldErrors,
  duplicateRoom,
}: StepProps & { duplicateRoom: RoomRecord | null }) {
  return (
    <FormSection title="Identification" icon="badge">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField
          label="Room Number"
          required
          error={fieldErrors.roomNumber}
          warning={
            !fieldErrors.roomNumber && duplicateRoom
              ? `Room ${form.roomNumber} already exists in ${form.building}`
              : undefined
          }
        >
          <input
            type="text"
            name="roomNumber"
            value={form.roomNumber}
            onChange={(e) => setField('roomNumber', e.target.value)}
            placeholder="e.g. 206"
            autoFocus
            className={inputClass(!!fieldErrors.roomNumber)}
          />
        </FormField>
        <FormField label="Building" required error={fieldErrors.building}>
          <input
            type="text"
            name="building"
            value={form.building}
            onChange={(e) => setField('building', e.target.value)}
            placeholder="e.g. CE"
            className={inputClass(!!fieldErrors.building)}
          />
        </FormField>
      </div>
    </FormSection>
  );
}

// ── Step 2: Details ──
export function DetailsStep({ form, setField, fieldErrors }: StepProps) {
  return (
    <>
      <FormSection title="Room Type" icon="category">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {ROOM_TYPES.map((rt) => {
            const selected = form.roomType === rt.value;
            return (
              <button
                key={rt.value}
                type="button"
                aria-pressed={selected}
                onClick={() => setField('roomType', rt.value)}
                className={`flex items-center gap-2 p-2.5 rounded-lg border text-left transition ${
                  selected
                    ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                    : 'border-surface-variant hover:border-primary/50'
                }`}
              >
                <Icon
                  name={rt.icon}
                  size={16}
                  className={
                    selected ? 'text-primary' : 'text-on-surface-variant'
                  }
                />
                <span className="text-xs font-semibold text-on-surface truncate">
                  {rt.label}
                </span>
              </button>
            );
          })}
        </div>
      </FormSection>

      <div className="mt-4">
        <FormSection title="Capacity" icon="group">
          <FormField
            label="Seats"
            error={fieldErrors.capacity}
            hint="Used by S-8 (cohort overflow warning). Leave blank if unknown."
          >
            <div className="relative">
              <input
                type="number"
                min={0}
                max={1000}
                name="capacity"
                value={form.capacity}
                onChange={(e) => setField('capacity', e.target.value)}
                placeholder="e.g. 40"
                className={`${inputClass(!!fieldErrors.capacity)} pr-14`}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">
                seats
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {[20, 30, 40, 50, 60, 100].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setField('capacity', String(n))}
                  className={`text-[10px] px-2 py-1 rounded border transition ${
                    form.capacity === String(n)
                      ? 'border-primary bg-primary/10 text-primary font-semibold'
                      : 'border-surface-variant text-on-surface-variant hover:border-primary/50'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </FormField>
        </FormSection>
      </div>
    </>
  );
}

// ── Step 3: Ownership ──
export function OwnershipStep({
  form,
  setField,
  fieldErrors,
  setShared,
  isDH,
  myDeptId,
  departments,
}: StepProps & {
  setShared: (isShared: boolean) => void;
  isDH: boolean;
  myDeptId: string | null;
  departments: Department[];
}) {
  return (
    <FormSection title="Ownership" icon="apartment">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <OwnershipOption
          selected={form.isShared}
          onSelect={() => setShared(true)}
          icon="groups"
          title="Shared room"
          description="Available to all departments. Any DH can manage it."
        />
        <OwnershipOption
          selected={!form.isShared}
          onSelect={() => setShared(false)}
          icon="business"
          title="Department-owned"
          description="Belongs to a specific department."
        />
      </div>

      {!form.isShared && (
        <div className="mt-4">
          <FormField
            label="Owned by"
            required
            error={fieldErrors.deptId}
            hint={isDH ? 'Locked to your department.' : undefined}
          >
            <select
              name="deptId"
              value={form.deptId}
              onChange={(e) => setField('deptId', e.target.value)}
              disabled={isDH}
              className={`${inputClass(
                !!fieldErrors.deptId,
              )} disabled:opacity-60 disabled:cursor-not-allowed`}
            >
              <option value="">— select department —</option>
              {departments
                .filter((d) => d.isActive)
                .filter((d) => !isDH || String(d.deptId) === myDeptId)
                .map((d) => (
                  <option key={d.deptId} value={d.deptId}>
                    [{d.deptCode}] {d.deptName}
                  </option>
                ))}
            </select>
          </FormField>
        </div>
      )}
    </FormSection>
  );
}

// ── Step 4: Review ──
export function ReviewStep({
  form,
  departments,
}: {
  form: FormState;
  departments: Department[];
}) {
  const typeMeta = ROOM_TYPES.find((x) => x.value === form.roomType);
  const typeLabel = typeMeta?.label ?? form.roomType.replace('_', ' ');
  const typeIcon = TYPE_ICON[form.roomType];
  const deptCode = departments.find(
    (x) => String(x.deptId) === form.deptId,
  )?.deptCode;

  return (
    <div className="space-y-3">
      <p className="text-xs text-on-surface-variant">
        Review the details below, then create the room.
      </p>

      <div className="rounded-xl border border-surface-variant bg-surface-container-lowest p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Icon name={typeIcon} size={20} />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-on-surface font-mono truncate">
              Room {form.roomNumber || '—'}
            </p>
            <p className="text-xs text-on-surface-variant truncate">
              {form.building || '—'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs pt-1">
          <div>
            <p className="text-on-surface-variant">Type</p>
            <p className="font-semibold text-on-surface">{typeLabel}</p>
          </div>
          <div>
            <p className="text-on-surface-variant">Capacity</p>
            <p className="font-semibold text-on-surface">
              {form.capacity ? `${form.capacity} seats` : 'Not specified'}
            </p>
          </div>
          <div className="col-span-2">
            <p className="text-on-surface-variant">Ownership</p>
            <p className="font-semibold text-on-surface">
              {form.isShared
                ? 'Shared (any department)'
                : deptCode
                ? `Owned by ${deptCode}`
                : '—'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function LivePreview({
  form,
  departments,
}: {
  form: FormState;
  departments: Department[];
}) {
  const typeMeta = ROOM_TYPES.find((x) => x.value === form.roomType);
  const typeLabel = typeMeta?.label ?? form.roomType.replace('_', ' ');
  const typeIcon = TYPE_ICON[form.roomType];
  const accent = TYPE_ACCENT[form.roomType];

  const hasNumber = !!form.roomNumber.trim();
  const hasBuilding = !!form.building.trim();
  const hasOwner = form.isShared || !!form.deptId;
  const isReady = hasNumber && hasBuilding && hasOwner;

  const deptCode = departments.find(
    (x) => String(x.deptId) === form.deptId,
  )?.deptCode;

  return (
    <div className="rounded-xl border border-primary/15 bg-gradient-to-br from-primary/[0.04] via-primary/[0.02] to-transparent p-3.5 space-y-2.5">
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Icon name="preview" size={14} className="text-primary" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
            Live preview
          </span>
        </div>
        {isReady ? (
          <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-700 px-1.5 py-0.5 rounded-full border border-emerald-500/30">
            <Icon name="check_circle" size={9} />
            Ready to create
          </span>
        ) : (
          <span className="text-[9px] font-medium uppercase tracking-wider text-on-surface-variant/70">
            Incomplete
          </span>
        )}
      </div>

      {/* Body — icon + identity */}
      <div className="flex items-center gap-3">
        <div
          className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border transition-colors ${accent}`}
        >
          <Icon name={typeIcon} size={22} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-mono font-bold text-base text-on-surface truncate leading-tight">
            {hasNumber ? (
              <>Room {form.roomNumber}</>
            ) : (
              <span className="italic font-normal text-on-surface-variant/50">
                Room —
              </span>
            )}
          </p>
          <p className="text-xs text-on-surface-variant truncate mt-0.5">
            {hasBuilding ? (
              form.building
            ) : (
              <span className="italic opacity-60">Building not set</span>
            )}
          </p>
        </div>
      </div>

      {/* Metadata chips */}
      <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-primary/10">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/70 text-[10px] font-semibold text-on-surface border border-surface-variant">
          <Icon name={typeIcon} size={10} className="opacity-70" />
          {typeLabel}
        </span>

        {form.capacity ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/70 text-[10px] font-semibold text-on-surface border border-surface-variant">
            <Icon name="group" size={10} className="opacity-70" />
            {form.capacity} seats
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-transparent text-[10px] font-medium italic text-on-surface-variant/60 border border-dashed border-surface-variant">
            <Icon name="group" size={10} />
            No capacity
          </span>
        )}

        {form.isShared ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[10px] font-bold uppercase tracking-wider border border-blue-200">
            <Icon name="groups" size={10} />
            Shared
          </span>
        ) : deptCode ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/70 text-[10px] font-semibold text-on-surface border border-surface-variant">
            <Icon name="business" size={10} className="opacity-70" />
            {deptCode}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-transparent text-[10px] font-medium italic text-on-surface-variant/60 border border-dashed border-surface-variant">
            <Icon name="help" size={10} />
            Ownership
          </span>
        )}
      </div>
    </div>
  );
}