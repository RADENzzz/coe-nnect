import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Icon from '../../components/ui/Icon';
import NotificationSettingsTab from './components/NotificationSettingsTab';

type TabKey = 'notifications';

interface TabDef {
  key: TabKey;
  label: string;
  icon: string;
}

const TABS: TabDef[] = [
  {
    key: 'notifications',
    label: 'Notifications',
    icon: 'notifications',
  },
  // Future: profile, appearance, etc.
];

function isValidTab(v: string | null): v is TabKey {
  return v !== null && TABS.some((t) => t.key === v);
}

export default function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initial = searchParams.get('tab');
  const [active, setActive] = useState<TabKey>(
    isValidTab(initial) ? initial : 'notifications',
  );

  // Keep the URL in sync when the tab changes
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', active);
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-primary flex items-center gap-2">
          <Icon name="settings" size={28} />
          Settings
        </h1>
        <p className="text-sm text-on-surface-variant mt-1">
          Manage your personal preferences.
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-surface-variant mb-6">
        <nav className="-mb-px flex gap-4" aria-label="Settings tabs">
          {TABS.map((t) => {
            const isActive = t.key === active;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setActive(t.key)}
                className={`flex items-center gap-2 px-1 py-3 text-sm font-semibold border-b-2 transition ${
                  isActive
                    ? 'border-primary text-primary'
                    : 'border-transparent text-slate-500 hover:text-slate-900'
                }`}
              >
                <Icon name={t.icon} size={16} />
                {t.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab body */}
      {active === 'notifications' && <NotificationSettingsTab />}
    </div>
  );
}