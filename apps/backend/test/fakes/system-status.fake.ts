export interface FakeMaintenanceNotice {
  active: boolean;
  title: string | null;
  message: string | null;
}

/**
 * Minimal in-memory stand-in for SystemStatusService.
 *
 * JwtAuthGuard reads the maintenance notice on every authenticated request.
 * Integration tests that exercise the real guard need this dependency even
 * when they only care about authentication and role checks.
 */
export function createFakeSystemStatus(
  notice: FakeMaintenanceNotice = {
    active: false,
    title: null,
    message: null,
  },
) {
  return {
    getMaintenanceNotice: jest.fn().mockResolvedValue(notice),
  };
}
