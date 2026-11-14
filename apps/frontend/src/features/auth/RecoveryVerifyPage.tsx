import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { verifyRecoveryEmail } from '../../api/recovery.api';
import Icon from '../../components/ui/Icon';
import ThemeToggle from '../../components/ui/ThemeToggle';

type VerifyState =
  | { status: 'verifying' }
  | { status: 'success' }
  | { status: 'error'; message: string };

function apiError(error: any): string {
  const message = error?.response?.data?.message;
  if (Array.isArray(message)) return String(message[0] ?? '');
  if (typeof message === 'string' && message.trim()) return message;
  return error?.message ?? 'Could not verify this link.';
}

export default function RecoveryVerifyPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [state, setState] = useState<VerifyState>({ status: 'verifying' });
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    if (!token) {
      setState({
        status: 'error',
        message: 'This verification link is missing its token.',
      });
      return;
    }

    verifyRecoveryEmail(token)
      .then(() => setState({ status: 'success' }))
      .catch((err) =>
        setState({ status: 'error', message: apiError(err) }),
      );
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="fixed top-4 right-4 z-50 flex h-11 w-11 items-center justify-center rounded-full border border-outline-variant bg-surface shadow-sm">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm text-center">
        {state.status === 'verifying' && (
          <>
            <Icon
              name="progress_activity"
              size={40}
              className="mx-auto text-primary animate-spin"
            />
            <h1 className="mt-4 text-xl font-extrabold text-slate-900">
              Verifying your recovery email
            </h1>
            <p className="mt-1 text-sm text-slate-500">This only takes a moment.</p>
          </>
        )}

        {state.status === 'success' && (
          <>
            <Icon
              name="check_circle"
              size={44}
              className="mx-auto text-emerald-600"
            />
            <h1 className="mt-4 text-xl font-extrabold text-slate-900">
              Recovery email verified
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              You can now receive password reset links at this address. Your
              login email has not changed.
            </p>
            <Link
              to="/login"
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90"
            >
              <Icon name="login" size={16} />
              Go to sign in
            </Link>
          </>
        )}

        {state.status === 'error' && (
          <>
            <Icon
              name="error"
              size={44}
              className="mx-auto text-red-600"
            />
            <h1 className="mt-4 text-xl font-extrabold text-slate-900">
              Verification failed
            </h1>
            <p className="mt-2 text-sm text-slate-600">{state.message}</p>
            <p className="mt-2 text-xs text-slate-500">
              Sign in, open Settings → Security, and request a new verification
              email.
            </p>
            <Link
              to="/login"
              className="mt-6 inline-flex items-center gap-2 rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Icon name="arrow_back" size={16} />
              Back to sign in
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
