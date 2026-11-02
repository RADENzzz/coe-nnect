/**
 * Local-only escape hatch: let the developer see the maintenance wall the
 * same way a normal user does, instead of being bypassed as `administrator`.
 *
 * It is ignored in production builds, so it can never weaken the real gate.
 */
const PREVIEW_KEY = 'coe-nnect:maintenance-preview';

export function isMaintenancePreviewEnabled(): boolean {
  if (!import.meta.env.DEV) return false;
  try {
    return localStorage.getItem(PREVIEW_KEY) === '1';
  } catch {
    return false;
  }
}

export function setMaintenancePreviewEnabled(enabled: boolean): void {
  if (!import.meta.env.DEV) return;
  try {
    if (enabled) localStorage.setItem(PREVIEW_KEY, '1');
    else localStorage.removeItem(PREVIEW_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Local-only maintenance bypass.
 *
 * When enabled, the dev machine ignores the database maintenance flag so
 * department heads and deans can keep testing locally while the hosted app
 * stays in maintenance. Production builds ignore this (Vite `DEV` is false),
 * and the backend has its own `MAINTENANCE_BYPASS` guard.
 */
export function isLocalMaintenanceBypassEnabled(): boolean {
  return (
    import.meta.env.DEV && import.meta.env.VITE_MAINTENANCE_BYPASS === 'true'
  );
}
