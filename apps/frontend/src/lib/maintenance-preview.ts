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
