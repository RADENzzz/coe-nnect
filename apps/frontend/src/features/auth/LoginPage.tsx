import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import Icon from '../../components/ui/Icon';

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
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const handleCopy = (email: string, password: string) => {
    navigator.clipboard?.writeText(`Email: ${email}\nPassword: ${password}`);
    setCopied(email);
    setTimeout(() => setCopied(null), 1500);
  };

  if (accounts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3">
      {/* Panel */}
      {open && (
        <div className="w-80 bg-white border border-slate-200 shadow-sm overflow-hidden animate-fade-up">
          {/* Header */}
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

          {/* Accounts */}
          <div className="p-3 space-y-2">
            {accounts.map((acct) => (
              <div
                key={acct.email}
                className="bg-slate-50 border border-slate-200 hover:border-slate-300 p-3 transition-colors"
              >
                <div className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex items-center justify-center w-8 h-8 bg-red-50 border border-red-200 shrink-0">
                    <Icon name={acct.icon} filled size={16} className="text-[#5c1219]" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-900">{acct.label}</p>
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
                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-[#5c1219] text-white text-[11px] font-semibold hover:opacity-90 active:scale-[0.98] transition-all"
                  >
                    <Icon name="login" size={14} />
                    Fill
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCopy(acct.email, acct.password)}
                    className="flex items-center justify-center w-9 border border-slate-300 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-900 active:scale-[0.98] transition-all"
                    aria-label="Copy credentials"
                  >
                    <Icon name={copied === acct.email ? 'check' : 'content_copy'} size={14} />
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

      {/* Toggle FAB */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-xs font-bold uppercase tracking-wide shadow-sm hover:bg-slate-800 active:scale-[0.97] transition-all border border-slate-700"
        aria-label="Toggle dev login helper"
      >
        <Icon name={open ? 'close' : 'developer_mode'} filled size={16} />
        {open ? 'Hide' : 'Dev Login'}
      </button>
    </div>
  );
}

/* ────────────────────────────────────────────
   LOGIN PAGE
   ──────────────────────────────────────────── */
export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: Location })?.from?.pathname ?? null;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shakeKey, setShakeKey] = useState(0);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) throw signInError;
      if (!data.user) throw new Error('No user returned from login');

      // Try reading role from app_metadata first (set by service role, no RLS issues)
      const metaRole = data.user.app_metadata?.role as string | undefined;

      // Fallback: fetch from users table (works if RLS allows self-read)
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

      // Redirect based on role.
      // After the Admin→Dean consolidation:
      //   - The dev account (administrator) and the Dean both land
      //     on /dean/dashboard.
      //   - Department Heads land on /dashboard.
      if (from) {
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
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-slate-50 overflow-hidden">
      {/* ───────── LEFT: Brand Panel ───────── */}
      <div className="hidden lg:flex lg:w-[45%] relative bg-[#5c1219] overflow-hidden">
        {/* Grid pattern */}
        <svg
          className="absolute inset-0 w-full h-full opacity-[0.07]"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
              <path d="M 32 0 L 0 0 0 32" fill="none" stroke="white" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>

        {/* Subtle accent blobs */}
        <div className="absolute -top-24 -left-24 w-80 h-80 bg-white/5 rounded-full blur-3xl animate-pulse-slow" />
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-white/5 rounded-full blur-3xl animate-pulse-slower" />

        <div className="relative z-10 flex flex-col justify-between p-12 text-white w-full">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 border border-white/20 bg-white/10 flex items-center justify-center">
              <Icon name="school" filled className="text-white" size={24} />
            </div>
            <div>
              <p className="text-sm font-bold tracking-tight text-white">CoE-NNECT</p>
              <p className="text-[14px] text-white/60">WMSU · College of Engineering</p>
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
              Manage faculty schedules, resolve conflicts, and plan academic terms, all in one place.
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
          {/* Mobile logo */}
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
            <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight mb-1">Sign in</h2>
            <p className="text-sm text-slate-500">
              Enter your credentials to continue.
            </p>
          </div>

          {error && (
            <div className="mb-5 flex items-start gap-3 p-3.5 bg-red-50 border border-red-200 animate-fade-in">
              <Icon name="error" filled className="text-red-600 shrink-0 mt-0.5" size={18} />
              <p className="flex-1 text-sm font-medium text-red-800">{error}</p>
              <button
                type="button"
                onClick={() => setError(null)}
                className="text-red-400 hover:text-red-700 transition-colors"
                aria-label="Dismiss"
              >
                <Icon name="close" size={16} />
              </button>
            </div>
          )}

          <form className="space-y-4" onSubmit={handleLogin}>
            <FloatingInput
              id="email"
              type="email"
              label="Email"
              value={email}
              onChange={setEmail}
              icon="mail"
              autoComplete="email"
              required
            />

            <FloatingInput
              id="password"
              type="password"
              label="Password"
              value={password}
              onChange={setPassword}
              icon="lock"
              autoComplete="current-password"
              required
            />

            <button
              type="submit"
              disabled={loading || !email || !password}
              className="w-full py-2.5 mt-1 bg-[#5c1219] text-white text-sm font-semibold hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed relative overflow-hidden group"
            >
              <span
                className={`flex items-center justify-center gap-2 transition-transform duration-200 ${loading ? 'translate-y-8' : 'translate-y-0'
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
                  <span className="text-sm">Signing in…</span>
                </span>
              )}
            </button>
          </form>
        </div>
      </div>

      {/* ───────── DEV LOGIN POPUP (dev only) ───────── */}
      {import.meta.env.DEV && DEV_ACCOUNTS.length > 0 && (
        <DevLoginPopup
          accounts={DEV_ACCOUNTS}
          onFill={(devEmail, devPassword) => {
            setEmail(devEmail);
            setPassword(devPassword);
            setError(null);
          }}
        />
      )}
    </div>
  );
}

/* ────────────────────────────────────────────
   Floating Input
   ──────────────────────────────────────────── */
interface FloatingInputProps {
  id: string;
  type: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  icon?: string;
  autoComplete?: string;
  required?: boolean;
}

function FloatingInput({
  id,
  type,
  label,
  value,
  onChange,
  icon,
  autoComplete,
  required,
}: FloatingInputProps) {
  const [focused, setFocused] = useState(false);
  const hasValue = value.length > 0;
  const isActive = focused || hasValue;

  return (
    <div className="relative">
      {icon && (
        <span
          className={`absolute left-3 top-1/2 -translate-y-1/2 transition-colors ${focused ? 'text-[#5c1219]' : 'text-slate-400'
            }`}
        >
          <Icon name={icon} size={18} />
        </span>
      )}

      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        autoComplete={autoComplete}
        required={required}
        placeholder=" "
        className={`peer w-full ${icon ? 'pl-10' : 'pl-3'
          } pr-3 pt-5 pb-1.5 text-sm bg-white border transition-all duration-200 outline-none text-slate-900 ${focused
            ? 'border-slate-500 shadow-[0_0_0_2px_rgba(92,18,25,0.12)]'
            : 'border-slate-300 hover:border-slate-400'
          }`}
      />

      <label
        htmlFor={id}
        className={`absolute ${icon ? 'left-10' : 'left-3'
          } pointer-events-none transition-all duration-200 ${isActive
            ? 'top-1.5 text-[10px] font-semibold text-[#5c1219] tracking-wide uppercase'
            : 'top-1/2 -translate-y-1/2 text-sm text-slate-400'
          }`}
      >
        {label}
      </label>
    </div>
  );
}