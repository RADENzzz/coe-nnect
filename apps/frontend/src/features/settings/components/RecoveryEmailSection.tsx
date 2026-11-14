import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Icon from '../../../components/ui/Icon';
import {
  fetchRecoverySettings,
  removeRecoveryEmail,
  setRecoveryEmail,
} from '../../../api/recovery.api';
import { useAuthStore } from '../../../store/auth.store';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function apiError(error: any): string {
  const message = error?.response?.data?.message;
  if (Array.isArray(message)) return String(message[0] ?? '');
  if (typeof message === 'string' && message.trim()) return message;
  return error?.message ?? 'Something went wrong. Please try again.';
}

export default function RecoveryEmailSection() {
  const queryClient = useQueryClient();
  const profile = useAuthStore((s) => s.profile);

  const [email, setEmail] = useState('');
  const [editing, setEditing] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const settingsQuery = useQuery({
    queryKey: ['recovery-settings'],
    queryFn: fetchRecoverySettings,
  });
  const settings = settingsQuery.data;

  useEffect(() => {
    if (settings?.recoveryEmail) setEmail(settings.recoveryEmail);
  }, [settings?.recoveryEmail]);

  const saveMutation = useMutation({
    mutationFn: setRecoveryEmail,
    onSuccess: (result) => {
      setError(null);
      setFeedback(
        result.verificationSent
          ? `Verification email sent to ${result.recoveryEmail}. Check your inbox.`
          : result.verified
            ? 'This recovery email is already verified.'
            : 'Recovery email saved.',
      );
      setEditing(false);
      void queryClient.invalidateQueries({
        queryKey: ['recovery-settings'],
      });
    },
    onError: (err: any) => {
      setFeedback(null);
      setError(apiError(err));
    },
  });

  const removeMutation = useMutation({
    mutationFn: removeRecoveryEmail,
    onSuccess: () => {
      setError(null);
      setFeedback('Recovery email removed.');
      setEmail('');
      setEditing(false);
      void queryClient.invalidateQueries({
        queryKey: ['recovery-settings'],
      });
    },
    onError: (err: any) => {
      setFeedback(null);
      setError(apiError(err));
    },
  });

  const handleSave = (event: React.FormEvent) => {
    event.preventDefault();
    const value = email.trim().toLowerCase();
    if (!EMAIL_REGEX.test(value)) {
      setError('Enter a valid email address.');
      setFeedback(null);
      return;
    }
    saveMutation.mutate(value);
  };

  const showForm = editing || !settings?.recoveryEmail;
  const busy = saveMutation.isPending || removeMutation.isPending;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 space-y-5">
      <div>
        <h2 className="text-base font-extrabold text-slate-900 uppercase tracking-wide">
          Recovery email
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Optional. If you forget your password, a reset link can be sent to
          this address instead of your login email.
        </p>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm flex items-start gap-2">
          <Icon name="error" size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {feedback && (
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm flex items-start gap-2">
          <Icon name="check_circle" size={16} className="mt-0.5 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {settingsQuery.isLoading ? (
        <div className="h-10 rounded-lg bg-slate-100 animate-pulse" />
      ) : settingsQuery.isError ? (
        <div className="flex items-center justify-between gap-3 text-sm text-slate-600">
          <span>Could not load your recovery-email settings.</span>
          <button
            type="button"
            onClick={() => void settingsQuery.refetch()}
            className="text-primary font-semibold hover:underline"
          >
            Retry
          </button>
        </div>
      ) : settings?.mailConfigured === false ? (
        <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm flex items-start gap-2">
          <Icon name="info" size={16} className="mt-0.5 shrink-0" />
          <span>
            Email recovery is not configured on this server yet. Ask an
            administrator to set up SMTP delivery.
          </span>
        </div>
      ) : (
        <>
          {settings?.recoveryEmail && !editing && (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900 break-all">
                  {settings.recoveryEmail}
                </p>
                <p
                  className={`text-[11px] font-semibold uppercase tracking-wider mt-0.5 ${
                    settings.verified ? 'text-emerald-600' : 'text-amber-600'
                  }`}
                >
                  {settings.verified ? 'Verified' : 'Pending verification'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                {!settings.verified && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      saveMutation.mutate(settings.recoveryEmail as string)
                    }
                    className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-white disabled:opacity-40"
                  >
                    Resend verification
                  </button>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setEmail(settings.recoveryEmail ?? '');
                    setEditing(true);
                    setError(null);
                    setFeedback(null);
                  }}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-white disabled:opacity-40"
                >
                  Change
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => removeMutation.mutate()}
                  className="px-3 py-1.5 rounded-lg border border-red-200 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40"
                >
                  {removeMutation.isPending ? 'Removing…' : 'Remove'}
                </button>
              </div>
            </div>
          )}

          {settings?.recoveryEmail && !settings.verified && !editing && (
            <p className="text-xs text-slate-500">
              Check the inbox for {settings.recoveryEmail} and open the
              verification link before this address can receive reset links.
            </p>
          )}

          {showForm && (
            <form onSubmit={handleSave} className="space-y-3 max-w-md">
              <div>
                <label
                  htmlFor="recovery-email"
                  className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider"
                >
                  {settings?.recoveryEmail
                    ? 'New recovery email'
                    : 'Recovery email'}
                </label>
                <input
                  id="recovery-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  placeholder="you@example.com"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
                />
                <p className="text-[11px] text-slate-500 mt-1.5">
                  Your login email
                  {profile?.email ? (
                    <>
                      {' '}
                      (<strong>{profile.email}</strong>)
                    </>
                  ) : null}{' '}
                  stays the same.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={busy || !email.trim()}
                  className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {saveMutation.isPending ? 'Sending…' : 'Send verification'}
                </button>
                {settings?.recoveryEmail && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(false);
                      setEmail(settings.recoveryEmail ?? '');
                      setError(null);
                    }}
                    className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          )}
        </>
      )}
    </section>
  );
}
