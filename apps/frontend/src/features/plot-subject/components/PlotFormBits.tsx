import Icon from '../../../components/ui/Icon';

export function SectionHeader({
  step,
  icon,
  title,
  subtitle,
}: {
  step?: number;
  icon: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex items-start gap-2 mb-3">
      <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[11px] font-bold shrink-0 mt-0.5">
        {step ?? <Icon name={icon} size={13} />}
      </div>
      <div>
        <h3 className="text-sm font-bold text-on-surface leading-tight">
          {title}
        </h3>
        {subtitle && (
          <p className="text-[11px] text-on-surface-variant leading-snug mt-0.5">
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-1 text-[11px] text-red-600 flex items-center gap-1">
      <Icon name="error" size={11} filled />
      {message}
    </p>
  );
}

export function HelperText({
  children,
  tone = 'muted',
}: {
  children: React.ReactNode;
  tone?: 'muted' | 'info' | 'warn';
}) {
  const cls =
    tone === 'info'
      ? 'text-blue-700'
      : tone === 'warn'
      ? 'text-amber-700'
      : 'text-on-surface-variant';
  return (
    <p className={`text-[10px] mt-1 leading-snug ${cls}`}>{children}</p>
  );
}
