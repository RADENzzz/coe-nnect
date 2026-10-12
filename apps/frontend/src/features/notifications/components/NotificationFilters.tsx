import Icon from '../../../components/ui/Icon';
import { CATEGORY_OPTIONS } from '../constants';

export interface NotificationFiltersValue {
  category: string | null;
  isRead: boolean | null;
  search: string;
}

interface Props {
  value: NotificationFiltersValue;
  onChange: (next: NotificationFiltersValue) => void;
  unreadCount?: number;
}

export default function NotificationFilters({
  value,
  onChange,
  unreadCount,
}: Props) {
  const setField = <K extends keyof NotificationFiltersValue>(
    key: K,
    v: NotificationFiltersValue[K],
  ) => onChange({ ...value, [key]: v });

  return (
    <div className="flex flex-col gap-3 p-3 md:p-4 rounded-xl border border-surface-variant bg-surface-container-lowest">
      {/* Row 1 — search */}
      <div className="relative">
        <Icon
          name="search"
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
        />
        <input
          type="text"
          value={value.search}
          onChange={(e) => setField('search', e.target.value)}
          placeholder="Search notifications…"
          className="w-full pl-9 pr-3 py-2 bg-surface-container-low border border-surface-variant rounded-lg text-sm focus:outline-none focus:border-primary"
        />
      </div>

      {/* Row 2 — category + read state */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Category chips */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setField('category', null)}
            className={`px-2.5 py-1 text-xs font-semibold rounded-full border transition ${
              value.category === null
                ? 'bg-primary text-on-primary border-primary'
                : 'bg-white text-slate-600 border-surface-variant hover:border-primary/40'
            }`}
          >
            All
          </button>
          {CATEGORY_OPTIONS.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setField('category', c.value)}
              className={`px-2.5 py-1 text-xs font-semibold rounded-full border transition ${
                value.category === c.value
                  ? 'bg-primary text-on-primary border-primary'
                  : 'bg-white text-slate-600 border-surface-variant hover:border-primary/40'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* Read-state segmented control */}
        <div className="inline-flex rounded-lg border border-surface-variant bg-surface-container-low p-0.5">
          <button
            type="button"
            onClick={() => setField('isRead', null)}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition ${
              value.isRead === null
                ? 'bg-white text-primary shadow-sm'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setField('isRead', false)}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition ${
              value.isRead === false
                ? 'bg-white text-primary shadow-sm'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            Unread
            {unreadCount != null && unreadCount > 0 && (
              <span className="ml-1.5 text-[10px] font-bold text-[#5c1219] bg-[#5c1219]/10 px-1.5 py-0.5 rounded">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setField('isRead', true)}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition ${
              value.isRead === true
                ? 'bg-white text-primary shadow-sm'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            Read
          </button>
        </div>
      </div>
    </div>
  );
}