import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { fetchTerms } from '../../../api/terms.api';
import Icon from '../../../components/ui/Icon';
import TermManagementSection from './terms/TermManagementSection';

interface Props {
  canWrite: boolean;
}

export default function TermsPanel({ canWrite }: Props) {
  // Shares the ['terms'] cache with the section below; no extra request.
  const { data: terms = [] } = useQuery({
    queryKey: ['terms'],
    queryFn: fetchTerms,
  });
  const activeTerm = terms.find((term) => term.isActive);

  return (
    <section
      id="academic-terms"
      className="scroll-mt-24 rounded-xl border border-surface-variant bg-surface-container-lowest overflow-hidden"
    >
      <header className="flex items-start gap-3 px-5 py-4 border-b border-surface-variant bg-surface-container-low">
        <Icon
          name="calendar_month"
          size={20}
          className="text-primary mt-0.5 shrink-0"
        />
        <div className="flex-1">
          <h2 className="text-sm font-bold text-on-surface uppercase tracking-wider">
            Academic Terms
          </h2>
          <p className="text-xs text-on-surface-variant mt-1">
            {activeTerm
              ? `Currently active: ${activeTerm.termName} · AY ${activeTerm.schoolYear}`
              : 'No term is currently active. Schedules require an active term.'}
          </p>
        </div>
        <Link
          to="/dean/system-settings/terms"
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-surface-variant text-on-surface text-xs font-semibold hover:bg-surface-container transition shrink-0"
        >
          Open full page
          <Icon name="arrow_forward" size={14} />
        </Link>
      </header>

      <TermManagementSection canWrite={canWrite} mode="compact" />
    </section>
  );
}
