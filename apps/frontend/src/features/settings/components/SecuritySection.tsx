// apps/frontend/src/features/settings/components/SecuritySection.tsx (NEW)
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { changeOwnPassword } from '../../../api/users.api';
import Icon from '../../../components/ui/Icon';

const PASSWORD_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

export default function SecuritySection() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: changeOwnPassword,
    onSuccess: () => {
      setSuccess('Password updated successfully.');
      setError(null);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    },
    onError: (err: any) => {
      setError(
        err?.response?.data?.message ??
          err?.message ??
          'Failed to update password.',
      );
      setSuccess(null);
    },
  });

  // ── Live strength checks ──
  const checks = {
    length: newPassword.length >= 8,
    upper: /[A-Z]/.test(newPassword),
    lower: /[a-z]/.test(newPassword),
    digit: /\d/.test(newPassword),
    symbol: /[@$!%*?&]/.test(newPassword),
  };
  const strengthScore = Object.values(checks).filter(Boolean).length;

  const strengthLabel =
    strengthScore === 5
      ? 'Strong'
      : strengthScore >= 3
      ? 'Fair'
      : 'Weak';
  const strengthColor =
    strengthScore === 5
      ? 'bg-emerald-500'
      : strengthScore >= 3
      ? 'bg-amber-500'
      : 'bg-red-500';

  const passwordsMatch =
    newPassword.length > 0 && newPassword === confirmPassword;
  const passwordsMismatch =
    confirmPassword.length > 0 && newPassword !== confirmPassword;

  const canSubmit =
    currentPassword.length > 0 &&
    PASSWORD_REGEX.test(newPassword) &&
    passwordsMatch &&
    !mutation.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    mutation.mutate({ currentPassword, newPassword });
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 space-y-5">
      <div>
        <h2 className="text-base font-extrabold text-slate-900 uppercase tracking-wide">
          Security
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Change the password for your account.
        </p>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm flex items-start gap-2">
          <Icon name="error" size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm flex items-start gap-2">
          <Icon name="check_circle" size={16} className="mt-0.5 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
        {/* Current password */}
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider">
            Current password
          </label>
          <input
            type={showPasswords ? 'text' : 'password'}
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#5c1219]"
            placeholder="Enter current password"
          />
        </div>

        {/* New password */}
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider">
            New password
          </label>
          <input
            type={showPasswords ? 'text' : 'password'}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#5c1219]"
            placeholder="At least 8 characters"
          />

          {newPassword.length > 0 && (
            <>
              {/* Strength bar */}
              <div className="mt-2 flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-slate-100 rounded overflow-hidden">
                  <div
                    className={`h-full ${strengthColor} transition-all`}
                    style={{ width: `${(strengthScore / 5) * 100}%` }}
                  />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  {strengthLabel}
                </span>
              </div>

              {/* Checklist */}
              <ul className="mt-2 grid grid-cols-2 gap-1 text-[10px]">
                {[
                  { ok: checks.length, label: '8+ characters' },
                  { ok: checks.upper, label: 'Uppercase letter' },
                  { ok: checks.lower, label: 'Lowercase letter' },
                  { ok: checks.digit, label: 'Number' },
                  { ok: checks.symbol, label: 'Special (@$!%*?&)' },
                ].map((c) => (
                  <li
                    key={c.label}
                    className={`flex items-center gap-1 ${
                      c.ok ? 'text-emerald-600' : 'text-slate-400'
                    }`}
                  >
                    <Icon
                      name={c.ok ? 'check_circle' : 'radio_button_unchecked'}
                      size={12}
                    />
                    {c.label}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {/* Confirm */}
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider">
            Confirm new password
          </label>
          <input
            type={showPasswords ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            className={`w-full bg-slate-50 border rounded-lg px-3 py-2.5 text-sm focus:outline-none transition-colors ${
              passwordsMismatch
                ? 'border-red-300 focus:border-red-500'
                : 'border-slate-200 focus:border-[#5c1219]'
            }`}
            placeholder="Re-enter new password"
          />
          {passwordsMismatch && (
            <p className="text-[11px] text-red-600 mt-1">
              Passwords do not match.
            </p>
          )}
        </div>

        {/* Show/hide toggle */}
        <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showPasswords}
            onChange={(e) => setShowPasswords(e.target.checked)}
            className="rounded border-slate-300"
          />
          Show passwords
        </label>

        {/* Submit */}
        <div className="pt-2">
          <button
            type="submit"
            disabled={!canSubmit}
            className="px-5 py-2.5 rounded-lg bg-[#5c1219] text-white text-sm font-semibold hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {mutation.isPending ? 'Updating…' : 'Update Password'}
          </button>
        </div>
      </form>
    </section>
  );
}