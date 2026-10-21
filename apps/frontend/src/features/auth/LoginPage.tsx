import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import Icon from '../../components/ui/Icon';
import ThemeToggle from '../../components/ui/ThemeToggle';

/* ────────────────────────────────────────────
   DEV TEST ACCOUNTS (loaded from env)
   ──────────────────────────────────────────── */
const DEV_ACCOUNTS = [
  {
    label: 'College Dean',
    description: 'Dean Portal',
    email: import.meta.env.VITE_DEV_ADMIN_EMAIL ?? '',
    password: import.meta.env.VITE_DEV_ADMIN_PASSWORD ?? '',
    icon: 'school',
  },
  {
    label: 'Head / Dean',
    description: 'Head & Dean Dashboard',
    email: import.meta.env.VITE_DEV_HEAD_EMAIL ?? '',
    password: import.meta.env.VITE_DEV_HEAD_PASSWORD ?? '',
    icon: 'manage_accounts',
  },
].filter((a) => a.email && a.password);

/* ────────────────────────────────────────────
   Constants
   ──────────────────────────────────────────── */
const LS_REMEMBERED_EMAIL = 'coe-nnect:last-email';
const SS_DEV_PANEL_OPEN = 'coe-nnect:dev-panel-open';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ────────────────────────────────────────────
   DEV LOGIN POPUP
   ──────────────────────────────────────────── */
interface DevAccount {
  label: string;
  description: string;
  email: string;
  password: string;
  icon: string;
}

interface DevLoginPopupProps {
  accounts: DevAccount[];
  onFill: (email: string, password: string) => void;
}

function DevLoginPopup({ accounts, onFill }: DevLoginPopupProps) {
  const [open, setOpen] = useState(() => {
    try {
      return sessionStorage.getItem(SS_DEV_PANEL_OPEN) === 'true';
    } catch {
      return false;
    }
  });
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(SS_DEV_PANEL_OPEN, open ? 'true' : 'false');
    } catch {
      /* ignore */
    }
  }, [open]);

  const handleCopy = (email: string, password: string) => {
    navigator.clipboard?.writeText(`Email: ${email}\nPassword: ${password}`);
    setCopied(email);
    setTimeout(() => setCopied(null), 1500);
  };

  if (accounts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3">
      {open && (
        <div className="w-80 bg-white border border-slate-200 shadow-sm overflow-hidden animate-fade-up">
          <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center w-6 h-6 bg-amber-50 border border-amber-200">
                <Icon name="bug_report" filled size={14} className="text-amber-700" />
              </span>
              <div>
                <p className="text-xs font-bold text-slate-900 tracking-wide uppercase">
                  Dev Login
                </p>
                <p className="text-[10px] text-slate-500 leading-none">
                  Test accounts · local only
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="p-1 text-slate-400 hover:text-slate-700 transition-colors"
              aria-label="Close"
            >
              <Icon name="close" size={16} />
            </button>
          </div>

          <div className="p-3 space-y-2">
            {accounts.map((acct) => (
              <div
                key={acct.email}
                className="bg-slate-50 border border-slate-200 hover:border-slate-300 p-3 transition-colors"
              >
                <div className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex items-center justify-center w-8 h-8 bg-red-50 border border-red-200 shrink-0">
                    <Icon
                      name={acct.icon}
                      filled
                      size={16}
                      className="text-[#5c1219]"
                    />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-900">
                      {acct.label}
                    </p>
                    <p className="text-[10px] text-slate-500 mb-1.5">
                      {acct.description}
                    </p>
                    <div className="space-y-0.5 font-mono text-[10px] text-slate-500">
                      <p className="truncate">{acct.email}</p>
                      <p className="truncate">{acct.password}</p>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 mt-2.5">
                  <button
                    type="button"
                    onClick={() => onFill(acct.email, acct.password)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-[#5c1219] text-white text-[11px] font-semibold hover:opacity-90 active:scale-[0.98] transition-all rounded"
                  >
                    <Icon name="login" size={14} />
                    Fill
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCopy(acct.email, acct.password)}
                    className="flex items-center justify-center w-9 border border-slate-300 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-900 active:scale-[0.98] transition-all rounded"
                    aria-label="Copy credentials"
                  >
                    <Icon
                      name={copied === acct.email ? 'check' : 'content_copy'}
                      size={14}
                    />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="px-4 py-2 bg-slate-50 border-t border-slate-200">
            <p className="text-[10px] text-slate-500 flex items-center gap-1">
              <Icon name="warning" size={12} />
              Visible in development mode only
            </p>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-xs font-bold uppercase tracking-wide shadow-sm hover:bg-slate-800 active:scale-[0.97] transition-all border border-slate-700 rounded"
        aria-label="Toggle dev login helper"
      >
        <Icon
          name={open ? 'close' : 'developer_mode'}
          filled
          size={16}
        />
        {open ? 'Hide' : 'Dev Login'}
      </button>
    </div>
  );
}

/* ────────────────────────────────────────────
   FORGOT PASSWORD MODAL
   ──────────────────────────────────────────── */
function ForgotPasswordModal({
  open,
  initialEmail,
  onClose,
}: {
  open: boolean;
  initialEmail: string;
  onClose: () => void;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setEmail(initialEmail);
      setSent(false);
      setError(null);
    }
  }, [open, initialEmail]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!EMAIL_REGEX.test(email.trim())) {
      setError('Enter a valid email address');
      return;
    }

    setSending(true);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        { redirectTo: `${window.location.origin}/reset-password` },
      );
      if (resetError) throw resetError;
      setSent(true);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to send reset email');
    } finally {
      setSending(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px] animate-backdrop-in"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="forgot-title"
        className="relative w-full max-w-md bg-white shadow-2xl border border-slate-200 rounded-xl animate-fade-up"
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100">
          <div>
            <h2
              id="forgot-title"
              className="text-base font-bold text-slate-900"
            >
              Reset password
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              We'll email you a link to reset it.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"
            aria-label="Close"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {sent ? (
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-800 flex items-start gap-2">
              <Icon name="check_circle" size={16} className="shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Check your inbox</p>
                <p className="text-xs mt-0.5">
                  If an account exists for <strong>{email}</strong>, you'll
                  receive a reset link shortly.
                </p>
              </div>
            </div>
          ) : (
            <>
              {error && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
                  {error}
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@wmsu.edu.ph"
                  autoFocus
                  className="w-full px-3 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#5c1219] focus:ring-2 focus:ring-[#5c1219]/10"
                />
              </div>
            </>
          )}

          <div className="flex gap-2 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              {sent ? 'Close' : 'Cancel'}
            </button>
            {!sent && (
              <button
                type="submit"
                disabled={sending}
                className="px-4 py-2 text-sm font-semibold bg-[#5c1219] text-white hover:opacity-90 rounded-lg disabled:opacity-50 flex items-center gap-2"
              >
                {sending && (
                  <Icon
                    name="progress_activity"
                    size={14}
                    className="animate-spin"
                  />
                )}
                {sending ? 'Sending…' : 'Send reset link'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────
   LOGIN PAGE
   ──────────────────────────────────────────── */
export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const from =
    (location.state as { from?: Location })?.from?.pathname ?? null;

  const [email, setEmail] = useState(() => {
    try {
      return localStorage.getItem(LS_REMEMBERED_EMAIL) ?? '';
    } catch {
      return '';
    }
  });
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(() => {
    try {
      return !!localStorage.getItem(LS_REMEMBERED_EMAIL);
    } catch {
      return false;
    }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shakeKey, setShakeKey] = useState(0);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [slowNetwork, setSlowNetwork] = useState(false);
  const [attemptCount, setAttemptCount] = useState(0);

  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const emailValid = useMemo(() => EMAIL_REGEX.test(email.trim()), [email]);
  const canSubmit = emailValid && password.length > 0 && !loading;

  // Slow-network detection: if login takes > 3s, hint to the user
  useEffect(() => {
    if (!loading) {
      setSlowNetwork(false);
      return;
    }
    const t = setTimeout(() => setSlowNetwork(true), 3000);
    return () => clearTimeout(t);
  }, [loading]);

  // Detect Caps Lock while password field is focused
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (typeof e.getModifierState === 'function') {
        setCapsLockOn(e.getModifierState('CapsLock'));
      }
    };
    window.addEventListener('keydown', handle);
    window.addEventListener('keyup', handle);
    return () => {
      window.removeEventListener('keydown', handle);
      window.removeEventListener('keyup', handle);
    };
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    setError(null);

    const cleanEmail = email.trim().toLowerCase();

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (signInError) {
        // Surface lockout distinctly
        if (/too many|rate limit/i.test(signInError.message)) {
          throw new Error(
            'Too many attempts. Please wait a minute before trying again.',
          );
        }
        if (/email not confirmed/i.test(signInError.message)) {
          throw new Error(
            'Your email address hasn\'t been confirmed yet. Check your inbox for the confirmation link.',
          );
        }
        throw signInError;
      }
      if (!data.user) throw new Error('No user returned from login');

      // Persist email if "remember me" is checked
      try {
        if (remember) {
          localStorage.setItem(LS_REMEMBERED_EMAIL, cleanEmail);
        } else {
          localStorage.removeItem(LS_REMEMBERED_EMAIL);
        }
      } catch {
        /* ignore */
      }

      const metaRole = data.user.app_metadata?.role as string | undefined;

      let role = metaRole;
      if (!role) {
        const { data: profile, error: profileError } = await supabase
          .from('users')
          .select('role')
          .eq('user_id', data.user.id)
          .maybeSingle();

        if (profileError) throw profileError;

        if (!profile) {
          await supabase.auth.signOut();
          throw new Error(
            'Your account exists but has no profile. Contact the College Dean.',
          );
        }
        role = profile.role;
      }

      // Fetch the authoritative dept_active flag from the backend
      // BEFORE navigating, so we can decide whether a DH should be
      // routed to the wall or the dashboard.
      // We use the DB directly (not the API) to avoid a token-round-trip
      // right after sign-in — the token is available on `data.session`.
      let deptActive: boolean | null = null;
      if (role === 'department_head') {
        const { data: deptRow } = await supabase
          .from('users')
          .select(
            `dept_id, department:dept_id ( is_active, dept_code, dept_name )`,
          )
          .eq('user_id', data.user.id)
          .maybeSingle();
        const dept = Array.isArray((deptRow as any)?.department)
          ? (deptRow as any)?.department[0]
          : (deptRow as any)?.department;
        if (dept) deptActive = dept.is_active === true;
      } else if (role === 'college_dean' || role === 'administrator') {
        deptActive = true;
      }

      // Redirect based on role + dept state.
      if (
        role === 'department_head' &&
        deptActive === false
      ) {
        // Walled — bypass `from` because `from` might point at a page
        // the DH can't load anyway.
        navigate('/department-deactivated', { replace: true });
      } else if (from) {
        navigate(from, { replace: true });
      } else if (role === 'administrator' || role === 'college_dean') {
        navigate('/dean/dashboard', { replace: true });
      } else {
        navigate('/dashboard', { replace: true });
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'An error occurred during login';
      setError(msg);
      setShakeKey((k) => k + 1);
      setAttemptCount((c) => c + 1);

      // Focus the most likely field to fix
      requestAnimationFrame(() => {
        if (!emailValid) emailRef.current?.focus();
        else passwordRef.current?.focus();
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFillDev = useCallback((devEmail: string, devPassword: string) => {
    setEmail(devEmail);
    setPassword(devPassword);
    setError(null);
  }, []);

  const dismissError = useCallback(() => {
    setError(null);
  }, []);

  return (
    <div className="min-h-screen flex bg-slate-50 overflow-hidden">
      {/* Theme toggle — available before signing in */}
      <div className="fixed top-4 right-4 z-50 rounded-full border border-slate-200 bg-white shadow-sm">
        <ThemeToggle />
      </div>

      {/* ───────── LEFT: Brand Panel ───────── */}
      <div className="hidden lg:flex lg:w-[45%] relative bg-[#5c1219] overflow-hidden">
        <svg
          className="absolute inset-0 w-full h-full opacity-[0.07]"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <pattern
              id="grid"
              width="32"
              height="32"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 32 0 L 0 0 0 32"
                fill="none"
                stroke="white"
                strokeWidth="1"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>

        <div className="absolute -top-24 -left-24 w-80 h-80 bg-white/5 rounded-full blur-3xl animate-pulse-slow" />
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-white/5 rounded-full blur-3xl animate-pulse-slower" />

        <div className="relative z-10 flex flex-col justify-between p-12 text-white w-full">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 border border-white/20 bg-white/10 flex items-center justify-center">
              <Icon name="school" filled className="text-white" size={24} />
            </div>
            <div>
              <p className="text-sm font-bold tracking-tight text-white">
                CoE-NNECT
              </p>
              <p className="text-[14px] text-white/60">
                WMSU · College of Engineering
              </p>
            </div>
          </div>

          <div className="animate-fade-up">
            <h1 className="text-5xl font-extrabold leading-tight tracking-tight text-white">
              COLLEGE OF
              <br />
              ENGINEERING
              <br />
              <span className="text-white/50">SCHEDULING SYSTEM</span>
            </h1>
            <p className="mt-4 text-sm text-white/60 max-w-xs">
              Manage faculty schedules, resolve conflicts, and plan academic
              terms, all in one place.
            </p>
          </div>

          <p className="text-[11px] text-white/30">
            © {new Date().getFullYear()} Western Mindanao State University
          </p>
        </div>
      </div>

      {/* ───────── RIGHT: Login Form ───────── */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12 bg-slate-50">
        <div
          key={shakeKey}
          className="w-full max-w-sm animate-slide-in"
          style={error ? { animation: 'shake 400ms ease-in-out' } : undefined}
        >
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="w-9 h-9 bg-[#5c1219] flex items-center justify-center">
              <Icon name="school" filled className="text-white" size={22} />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900">CoE-NNECT</p>
              <p className="text-[11px] text-slate-500">WMSU Scheduling</p>
            </div>
          </div>

          <div className="mb-7">
            <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight mb-1">
              Sign in
            </h2>
            <p className="text-sm text-slate-500">
              Enter your credentials to continue.
            </p>
          </div>

          {/* Error banner */}
          {error && (
            <div
              role="alert"
              className="mb-5 flex items-start gap-3 p-3.5 bg-red-50 border border-red-200 animate-fade-in rounded-lg"
            >
              <Icon
                name="error"
                filled
                className="text-red-600 shrink-0 mt-0.5"
                size={18}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-red-800">{error}</p>
                {attemptCount >= 3 && (
                  <button
                    type="button"
                    onClick={() => setForgotOpen(true)}
                    className="text-xs font-semibold text-red-700 hover:text-red-900 underline mt-1"
                  >
                    Forgot your password?
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={dismissError}
                className="text-red-400 hover:text-red-700 transition-colors shrink-0"
                aria-label="Dismiss error"
              >
                <Icon name="close" size={16} />
              </button>
            </div>
          )}

          <form className="space-y-4" onSubmit={handleLogin} noValidate>
            <FloatingInput
              inputRef={emailRef}
              id="email"
              name="email"
              type="email"
              label="Email"
              value={email}
              onChange={setEmail}
              icon="mail"
              autoComplete="email"
              required
            />

            {/* Caps Lock warning — shown only when password field is focused */}
            {capsLockOn && (
              <div className="flex items-center gap-1.5 text-[11px] text-amber-700 -mt-2">
                <Icon name="keyboard_capslock" size={12} />
                Caps Lock is on
              </div>
            )}

            <FloatingInput
              inputRef={passwordRef}
              id="password"
              name="password"
              type="password"
              label="Password"
              value={password}
              onChange={setPassword}
              icon="lock"
              autoComplete="current-password"
              required
              showPasswordToggle
            />

            {/* Remember + Forgot row */}
            <div className="flex items-center justify-between pt-1">
              <label className="inline-flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="w-3.5 h-3.5 accent-[#5c1219]"
                />
                Remember email
              </label>
              <button
                type="button"
                onClick={() => setForgotOpen(true)}
                className="text-xs font-semibold text-[#5c1219] hover:underline"
              >
                Forgot password?
              </button>
            </div>

            <button
              type="submit"
              disabled={!canSubmit}
              aria-busy={loading || undefined}
              className="w-full py-2.5 mt-3 bg-[#5c1219] text-white text-sm font-semibold hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed relative overflow-hidden group rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5c1219]/40 focus-visible:ring-offset-2"
            >
              <span
                className={`flex items-center justify-center gap-2 transition-transform duration-200 ${
                  loading ? 'translate-y-8' : 'translate-y-0'
                }`}
              >
                <span>Sign in</span>
                <Icon
                  name="arrow_forward"
                  size={16}
                  className="group-hover:translate-x-1 transition-transform"
                />
              </span>
              {loading && (
                <span className="absolute inset-0 flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  <span className="text-sm">
                    {slowNetwork ? 'Still working…' : 'Signing in…'}
                  </span>
                </span>
              )}
            </button>
          </form>

          <p className="mt-6 text-[11px] text-slate-400 text-center leading-relaxed">
            Trouble signing in? Contact your department head or the College Dean.
          </p>
        </div>
      </div>

      {/* ───────── DEV LOGIN POPUP ───────── */}
      {import.meta.env.DEV && DEV_ACCOUNTS.length > 0 && (
        <DevLoginPopup accounts={DEV_ACCOUNTS} onFill={handleFillDev} />
      )}

      {/* ───────── FORGOT PASSWORD MODAL ───────── */}
      <ForgotPasswordModal
        open={forgotOpen}
        initialEmail={email}
        onClose={() => setForgotOpen(false)}
      />
    </div>
  );
}

/* ────────────────────────────────────────────
   Floating Input
   ──────────────────────────────────────────── */
interface FloatingInputProps {
  id: string;
  name?: string;
  type: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  icon?: string;
  autoComplete?: string;
  required?: boolean;
  inputRef?: React.RefObject<HTMLInputElement>;
  showPasswordToggle?: boolean;
}

function FloatingInput({
  id,
  name,
  type,
  label,
  value,
  onChange,
  icon,
  autoComplete,
  required,
  inputRef,
  showPasswordToggle,
}: FloatingInputProps) {
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const hasValue = value.length > 0;
  const isActive = focused || hasValue;

  const effectiveType =
    showPasswordToggle && revealed ? 'text' : type;

  return (
    <div className="relative">
      {icon && (
        <span
          className={`absolute left-3 top-1/2 -translate-y-1/2 transition-colors z-10 ${
            focused ? 'text-[#5c1219]' : 'text-slate-400'
          }`}
          aria-hidden
        >
          <Icon name={icon} size={18} />
        </span>
      )}

      <input
        ref={inputRef}
        id={id}
        name={name ?? id}
        type={effectiveType}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        autoComplete={autoComplete}
        required={required}
        placeholder=" "
        aria-invalid={undefined}
        className={`peer w-full ${icon ? 'pl-10' : 'pl-3'} ${
          showPasswordToggle ? 'pr-10' : 'pr-3'
        } pt-5 pb-1.5 text-sm bg-white border transition-all duration-200 outline-none text-slate-900 rounded ${
          focused
            ? 'border-slate-500 shadow-[0_0_0_2px_rgba(92,18,25,0.12)]'
            : 'border-slate-300 hover:border-slate-400'
        }`}
      />

      <label
        htmlFor={id}
        className={`absolute ${
          icon ? 'left-10' : 'left-3'
        } pointer-events-none transition-all duration-200 ${
          isActive
            ? 'top-1.5 text-[10px] font-semibold text-[#5c1219] tracking-wide uppercase'
            : 'top-1/2 -translate-y-1/2 text-sm text-slate-400'
        }`}
      >
        {label}
      </label>

      {showPasswordToggle && (
        <button
          type="button"
          onClick={() => setRevealed((v) => !v)}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-700 transition-colors rounded"
          aria-label={revealed ? 'Hide password' : 'Show password'}
          tabIndex={-1}
        >
          <Icon name={revealed ? 'visibility_off' : 'visibility'} size={18} />
        </button>
      )}
    </div>
  );
}