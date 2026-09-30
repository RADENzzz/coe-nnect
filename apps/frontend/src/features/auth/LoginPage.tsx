import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import Icon from '../../components/ui/Icon';

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

      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('role')
        .eq('user_id', data.user.id)
        .single();

      if (profileError) throw profileError;

      if (from) {
        navigate(from, { replace: true });
      } else if (profile?.role === 'administrator') {
        navigate('/admin', { replace: true });
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
    <div className="min-h-screen flex bg-surface-low overflow-hidden">
      {/* ───────── LEFT: Brand Panel ───────── */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-primary overflow-hidden">
        {/* Animated gradient orbs */}
        <div className="absolute -top-20 -left-20 w-96 h-96 bg-tertiary rounded-full opacity-30 blur-3xl animate-pulse-slow" />
        <div className="absolute bottom-0 right-0 w-[28rem] h-[28rem] bg-secondary rounded-full opacity-20 blur-3xl animate-pulse-slower" />

        {/* Decorative grid pattern */}
        <svg
          className="absolute inset-0 w-full h-full opacity-10"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-between p-12 text-white w-full">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center border border-white/20">
              <Icon name="school" filled className="text-white" size={28} />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-white">CoE-NNECT</h2>
              <p className="text-xs text-white/70">WMSU · College of Engineering</p>
            </div>
          </div>

          {/* Center mark — no marketing copy */}
          <div className="animate-fade-up">
            <h1 className="text-5xl font-bold leading-tight tracking-tight text-white">
              College of
              <br />
              Engineering
              <br />
              <span className="text-secondary-container">Scheduling System</span>
            </h1>
          </div>

          {/* Footer */}
          <p className="text-xs text-white/50">
            © {new Date().getFullYear()} Western Mindanao State University
          </p>
        </div>
      </div>

      {/* ───────── RIGHT: Login Form ───────── */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <div
          key={shakeKey}
          className="w-full max-w-md animate-slide-in"
          style={error ? { animation: 'shake 400ms ease-in-out' } : undefined}
        >
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center justify-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center">
              <Icon name="school" filled className="text-on-primary" size={28} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-primary">CoE-NNECT</h2>
              <p className="text-xs text-on-surface-variant">WMSU Scheduling</p>
            </div>
          </div>

          <div className="mb-8">
            <h2 className="text-3xl font-bold text-primary mb-2">Sign in</h2>
            <p className="text-sm text-on-surface-variant">
              Enter your credentials to continue.
            </p>
          </div>

          {/* Error banner */}
          {error && (
            <div className="mb-6 flex items-start gap-3 p-4 rounded-lg bg-error-container border border-error/30 animate-fade-in">
              <Icon
                name="error"
                filled
                className="text-error shrink-0 mt-0.5"
                size={20}
              />
              <p className="flex-1 text-sm font-medium text-on-error-container">
                {error}
              </p>
              <button
                type="button"
                onClick={() => setError(null)}
                className="text-on-error-container/60 hover:text-on-error-container transition-colors"
                aria-label="Dismiss"
              >
                <Icon name="close" size={18} />
              </button>
            </div>
          )}

          <form className="space-y-5" onSubmit={handleLogin}>
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

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || !email || !password}
              className="btn-primary w-full py-3 mt-2 relative overflow-hidden group"
            >
              <span
                className={`flex items-center justify-center gap-2 transition-transform duration-200 ${
                  loading ? 'translate-y-8' : 'translate-y-0'
                }`}
              >
                <span>Sign in</span>
                <Icon
                  name="arrow_forward"
                  size={18}
                  className="group-hover:translate-x-1 transition-transform"
                />
              </span>
              {loading && (
                <span className="absolute inset-0 flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  <span>Signing in…</span>
                </span>
              )}
            </button>
          </form>
        </div>
      </div>
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
          className={`absolute left-3 top-1/2 -translate-y-1/2 transition-colors ${
            focused ? 'text-primary' : 'text-on-surface-variant'
          }`}
        >
          <Icon name={icon} size={20} />
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
        className={`peer w-full ${
          icon ? 'pl-11' : 'pl-4'
        } pr-4 pt-6 pb-2 text-body-md rounded-lg bg-surface-container-low border transition-all duration-200 outline-none ${
          focused
            ? 'border-secondary-container shadow-[0_0_0_3px_rgba(254,183,0,0.15)]'
            : 'border-surface-variant hover:border-outline-variant'
        }`}
      />

      <label
        htmlFor={id}
        className={`absolute ${
          icon ? 'left-11' : 'left-4'
        } pointer-events-none transition-all duration-200 ${
          isActive
            ? 'top-2 text-[11px] font-semibold text-primary tracking-wide uppercase'
            : 'top-1/2 -translate-y-1/2 text-sm text-on-surface-variant'
        }`}
      >
        {label}
      </label>
    </div>
  );
}