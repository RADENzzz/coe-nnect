import { Link } from 'react-router-dom';
import { useAuthStore } from '../../store/auth.store';
import Icon from '../../components/ui/Icon';
import TermManagementSection from './components/terms/TermManagementSection';
import { canWriteTerms } from './components/terms/term-shared';

/**
 * Standalone term manager. Semester Types stay in System Settings; everything
 * term-related is the same shared section the compact panel renders.
 */
export default function TermManagementPage() {
  const profile = useAuthStore((s) => s.profile);
  const canWrite = canWriteTerms(profile);

  return (
    <div className="space-y-5 max-w-6xl">
      <nav
        aria-label="System Settings / Term Management"
        className="flex items-center gap-2 text-xs text-on-surface-variant"
      >
        <Link to="/dean/system-settings" className="hover:underline">
          System Settings
        </Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page" className="font-semibold text-on-surface">
          Term Management
        </span>
      </nav>

      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">
            Term Management
          </h1>
          <p className="text-sm text-on-surface-variant mt-1">
            Search every academic term, create new terms, and manage their
            lifecycle.
          </p>
        </div>
        <Link
          to="/dean/system-settings"
          className="inline-flex items-center gap-1.5 rounded-lg border border-surface-variant px-3 py-2 text-xs font-semibold text-on-surface transition hover:bg-surface-container-low"
        >
          <Icon name="arrow_back" size={14} />
          Back to System Settings
        </Link>
      </header>

      <section className="rounded-xl border border-surface-variant bg-surface-container-lowest overflow-hidden">
        <TermManagementSection canWrite={canWrite} mode="full" />
      </section>
    </div>
  );
}
