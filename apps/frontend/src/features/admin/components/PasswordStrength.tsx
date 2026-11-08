import { PASSWORD_RULES, passwordStrength } from './constants';

export default function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;
  const s = passwordStrength(password);

  return (
    <div className="mt-2 space-y-2">
      <div className="flex gap-1">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${
              i < s.score ? s.barClass : 'bg-surface-variant'
            }`}
          />
        ))}
      </div>
      <p className={`text-[10px] font-semibold ${s.textClass}`}>{s.label}</p>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
        {PASSWORD_RULES.map((r) => {
          const ok = r.test(password);
          return (
            <li key={r.label} className={`flex items-center gap-1 ${ok ? 'text-green-700' : 'text-on-surface-variant'}`}>
              <span aria-hidden>{ok ? '✓' : '○'}</span>
              {r.label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}