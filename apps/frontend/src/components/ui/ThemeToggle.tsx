import Icon from './Icon';
import { useThemeStore } from '../../store/theme.store';

/**
 * Top-bar control for switching between the light (default) and dark themes.
 * The preference is persisted in localStorage.
 */
export default function ThemeToggle() {
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);

  const isDark = theme === 'dark';
  const label = isDark ? 'Switch to light mode' : 'Switch to dark mode';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="tap-target hover:bg-slate-50 transition-colors items-center justify-center text-slate-500 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5c1219]/30"
      aria-label={label}
      aria-pressed={isDark}
      title={label}
    >
      <Icon name={isDark ? 'light_mode' : 'dark_mode'} />
    </button>
  );
}
