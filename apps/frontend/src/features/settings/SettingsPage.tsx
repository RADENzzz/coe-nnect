import { useSearchParams } from 'react-router-dom';
import Icon from '../../components/ui/Icon';
import NotificationSettingsTab from './components/NotificationSettingsTab';
import SecuritySection from './components/SecuritySection';

type TabKey = 'notifications' | 'security';

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
  {
    key: 'security',
    label: 'Security',
    icon: 'lock',
  },
];

function isValidTab(v: string | null): v is TabKey {
  return v !== null && TABS.some((t) => t.key === v);
}

export default function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const active: TabKey = isValidTab(tabParam) ? tabParam : 'notifications';

  const setActive = (next: TabKey) => {
    const params = new URLSearchParams(searchParams);
    params.set('tab', next);
    setSearchParams(params, { replace: true });
  };

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

      <div className="border-b border-surface-variant mb-6">
        <nav
          className="-mb-px flex gap-4"
          aria-label="Settings tabs"
          role="tablist"
        >
          {TABS.map((t) => {
            const isActive = t.key === active;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={`settings-panel-${t.key}`}
                id={`settings-tab-${t.key}`}
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

      <div
        role="tabpanel"
        id={`settings-panel-${active}`}
        aria-labelledby={`settings-tab-${active}`}
      >
        {active === 'notifications' && <NotificationSettingsTab />}
        {active === 'security' && <SecuritySection />}
      </div>
    </div>
  );
}