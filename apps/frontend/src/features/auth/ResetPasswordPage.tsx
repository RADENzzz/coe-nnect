import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { resetPasswordWithToken } from '../../api/recovery.api';
import Icon from '../../components/ui/Icon';
import ThemeToggle from '../../components/ui/ThemeToggle';

const PASSWORD_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

function apiError(error: any): string {
  const message = error?.response?.data?.message;
  if (Array.isArray(message)) return String(message[0] ?? '');
  if (typeof message === 'string' && message.trim()) return message;
  return error?.message ?? 'Could not reset your password.';
}

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const mutation = useMutation({
    mutationFn: () => resetPasswordWithToken(token, newPassword),
    onSuccess: () => {
      setSuccess(true);
      setError(null);
      setNewPassword('');
      setConfirmPassword('');
    },
    onError: (err: any) => setError(apiError(err)),
  });

  const checks = {
    length: newPassword.length >= 8,
    upper: /[A-Z]/.test(newPassword),
    lower: /[a-z]/.test(newPassword),
    digit: /\d/.test(newPassword),
    symbol: /[@$!%*?&]/.test(newPassword),
  };
  const strengthScore = Object.values(checks).filter(Boolean).length;
  const strengthLabel =
    strengthScore === 5 ? 'Strong' : strengthScore >= 3 ? 'Fair' : 'Weak';
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
    !!token &&
    PASSWORD_REGEX.test(newPassword) &&
    passwordsMatch &&
    !mutation.isPending;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    mutation.mutate();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="fixed top-4 right-4 z-50 flex h-11 w-11 items-center justify-center rounded-full border border-outline-variant bg-surface shadow-sm">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-center">
          <Icon name="lock" size={40} className="mx-auto text-primary" />
          <h1 className="mt-3 text-xl font-extrabold text-slate-900">
            Choose a new password
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            This link can be used once and expires 30 minutes after it was sent.
          </p>
        </div>

        {!token ? (
          <div className="mt-6 space-y-4 text-center">
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              This reset link is missing its token.
            </div>
            <Link
              to="/login"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Icon name="arrow_back" size={16} />
              Back to sign in
            </Link>
          </div>
        ) : success ? (
          <div className="mt-6 space-y-4 text-center">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              <p className="font-semibold">Password updated</p>
              <p className="mt-1 text-xs">
                You can now sign in with your new password.
              </p>
            </div>
            <Link
              to="/login"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90"
            >
              <Icon name="login" size={16} />
              Go to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <Icon name="error" size={16} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label
                htmlFor="new-password"
                className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider"
              >
                New password
              </label>
              <input
                id="new-password"
                type={showPasswords ? 'text' : 'password'}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                autoComplete="new-password"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
                placeholder="At least 8 characters"
              />

              {newPassword.length > 0 && (
                <>
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

                  <ul className="mt-2 grid grid-cols-2 gap-1 text-[10px]">
                    {[
                      { ok: checks.length, label: '8+ characters' },
                      { ok: checks.upper, label: 'Uppercase letter' },
                      { ok: checks.lower, label: 'Lowercase letter' },
                      { ok: checks.digit, label: 'Number' },
                      { ok: checks.symbol, label: 'Special (@$!%*?&)' },
                    ].map((check) => (
                      <li
                        key={check.label}
                        className={`flex items-center gap-1 ${
                          check.ok ? 'text-emerald-600' : 'text-slate-400'
                        }`}
                      >
                        <Icon
                          name={
                            check.ok ? 'check_circle' : 'radio_button_unchecked'
                          }
                          size={12}
                        />
                        {check.label}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>

            <div>
              <label
                htmlFor="confirm-password"
                className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider"
              >
                Confirm new password
              </label>
              <input
                id="confirm-password"
                type={showPasswords ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                className={`w-full bg-slate-50 border rounded-lg px-3 py-2.5 text-sm focus:outline-none transition-colors ${
                  passwordsMismatch
                    ? 'border-red-300 focus:border-red-500'
                    : 'border-slate-200 focus:border-primary'
                }`}
                placeholder="Re-enter new password"
              />
              {passwordsMismatch && (
                <p className="text-[11px] text-red-600 mt-1">
                  Passwords do not match.
                </p>
              )}
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showPasswords}
                onChange={(event) => setShowPasswords(event.target.checked)}
                className="rounded border-slate-300"
              />
              Show passwords
            </label>

            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {mutation.isPending ? 'Updating…' : 'Update password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
