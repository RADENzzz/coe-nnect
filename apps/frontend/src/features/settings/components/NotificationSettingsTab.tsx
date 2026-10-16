import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Icon from '../../../components/ui/Icon';
import {
  fetchNotificationSettings,
  updateNotificationSetting,
  type NotificationSettingsItem,
} from '../../../api/notifications.api';

const CATEGORY_META: Record<
  string,
  { label: string; icon: string; description: string }
> = {
  schedule: {
    label: 'Schedule',
    icon: 'event',
    description: 'Status changes, flags, and conflicts on schedule entries.',
  },
  approvals: {
    label: 'Approvals',
    icon: 'task_alt',
    description: 'Cross-department faculty requests you submit or receive.',
  },
  scheduling: {
    label: 'Auto-generate',
    icon: 'auto_awesome',
    description: 'Progress and results of automatic schedule generation.',
  },
  academic: {
    label: 'Academic',
    icon: 'school',
    description: 'Term activation and prospectus imports.',
  },
  faculty: {
    label: 'Faculty',
    icon: 'person',
    description: 'Workload and assignment warnings.',
  },
  facility: {
    label: 'Facilities',
    icon: 'meeting_room',
    description: 'Room availability and capacity issues.',
  },
  admin: {
    label: 'Administration',
    icon: 'admin_panel_settings',
    description: 'User account lifecycle events.',
  },
};

const CATEGORY_ORDER: string[] = [
  'schedule',
  'approvals',
  'scheduling',
  'academic',
  'faculty',
  'facility',
  'admin',
];

function SkeletonRows() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="border border-slate-200 rounded-xl p-4 animate-pulse bg-white"
        >
          <div className="h-4 bg-slate-200 rounded w-1/4 mb-3" />
          <div className="space-y-2">
            <div className="h-3 bg-slate-100 rounded w-3/4" />
            <div className="h-3 bg-slate-100 rounded w-2/3" />
            <div className="h-3 bg-slate-100 rounded w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function NotificationSettingsTab() {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['notification-settings'],
    queryFn: fetchNotificationSettings,
    staleTime: 60 * 1000,
  });

  const update = useMutation({
    mutationFn: ({
      triggerKey,
      enabled,
    }: {
      triggerKey: string;
      enabled: boolean;
    }) => updateNotificationSetting(triggerKey, enabled),
    onMutate: async ({ triggerKey, enabled }) => {
      await queryClient.cancelQueries({ queryKey: ['notification-settings'] });
      const prev = queryClient.getQueryData<NotificationSettingsItem[]>([
        'notification-settings',
      ]);
      queryClient.setQueryData<NotificationSettingsItem[]>(
        ['notification-settings'],
        (old) =>
          old?.map((item) =>
            item.triggerKey === triggerKey ? { ...item, enabled } : item,
          ) ?? old,
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData(['notification-settings'], ctx.prev);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-settings'] });
    },
  });

  const bulkUpdate = useMutation({
    mutationFn: ({
      triggerKeys,
      enabled,
    }: {
      triggerKeys: string[];
      enabled: boolean;
    }) =>
      Promise.all(
        triggerKeys.map((key) => updateNotificationSetting(key, enabled)),
      ),
    onMutate: async ({ triggerKeys, enabled }) => {
      await queryClient.cancelQueries({ queryKey: ['notification-settings'] });
      const prev = queryClient.getQueryData<NotificationSettingsItem[]>([
        'notification-settings',
      ]);
      queryClient.setQueryData<NotificationSettingsItem[]>(
        ['notification-settings'],
        (old) =>
          old?.map((item) =>
            triggerKeys.includes(item.triggerKey)
              ? { ...item, enabled }
              : item,
          ) ?? old,
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData(['notification-settings'], ctx.prev);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-settings'] });
    },
  });

  const items = data ?? [];

  const grouped = useMemo(() => {
    const map = new Map<string, NotificationSettingsItem[]>();
    for (const item of items) {
      const list = map.get(item.category) ?? [];
      list.push(item);
      map.set(item.category, list);
    }
    return map;
  }, [items]);

  const enabledCount = items.filter((i) => i.enabled).length;
  const total = items.length;
  const bulkPendingKeys = new Set(
    bulkUpdate.isPending && bulkUpdate.variables
      ? bulkUpdate.variables.triggerKeys
      : [],
  );

  if (isLoading) return <SkeletonRows />;

  if (error) {
    return (
      <div
        role="alert"
        className="p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800 flex items-start gap-2"
      >
        <Icon name="error" size={16} className="mt-0.5 shrink-0" />
        <span>Failed to load settings: {(error as Error).message}</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="p-4 rounded-xl border border-surface-variant bg-surface-container-lowest">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Icon
              name="notifications_active"
              size={20}
              className="text-primary"
            />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">
              Choose what you want to be notified about
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              Turn off any notification type you don't need. Changes are
              applied immediately — no save button.
            </p>
            <p className="text-xs text-slate-400 mt-2">
              {enabledCount} of {total} enabled
            </p>
          </div>
        </div>
      </div>

      {CATEGORY_ORDER.map((cat) => {
        const list = grouped.get(cat);
        if (!list || list.length === 0) return null;
        const meta = CATEGORY_META[cat] ?? {
          label: cat,
          icon: 'notifications',
          description: '',
        };
        const allOn = list.every((i) => i.enabled);
        const catPending = list.some((i) => bulkPendingKeys.has(i.triggerKey));

        return (
          <section
            key={cat}
            className="border border-surface-variant rounded-xl overflow-hidden bg-white"
          >
            <header className="px-4 py-3 bg-surface-container-lowest border-b border-surface-variant flex items-center gap-3">
              <div className="w-8 h-8 rounded flex items-center justify-center bg-primary/10 shrink-0">
                <Icon name={meta.icon} size={16} className="text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900">
                  {meta.label}
                </p>
                {meta.description && (
                  <p className="text-xs text-slate-500">{meta.description}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() =>
                  bulkUpdate.mutate({
                    triggerKeys: list.map((i) => i.triggerKey),
                    enabled: !allOn,
                  })
                }
                disabled={catPending}
                className="text-[11px] font-semibold text-primary hover:underline disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
              >
                {allOn ? 'Disable all' : 'Enable all'}
              </button>
            </header>

            <ul className="divide-y divide-surface-variant">
              {list.map((item) => {
                const isPending =
                  (update.isPending &&
                    update.variables?.triggerKey === item.triggerKey) ||
                  bulkPendingKeys.has(item.triggerKey);

                return (
                  <li
                    key={item.triggerKey}
                    className="px-4 py-3 flex items-start justify-between gap-4"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900">
                        {item.label}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                        {item.description}
                      </p>
                    </div>

                    <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-0.5">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={item.enabled}
                        disabled={isPending}
                        aria-label={item.label}
                        onChange={(e) =>
                          update.mutate({
                            triggerKey: item.triggerKey,
                            enabled: e.target.checked,
                          })
                        }
                      />
                      <div className="w-9 h-5 bg-slate-300 peer-checked:bg-[#5c1219] rounded-full transition-colors peer-disabled:opacity-50" />
                      <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4" />
                    </label>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}