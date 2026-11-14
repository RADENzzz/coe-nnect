import { api } from './client';

export interface RecoverySettings {
  recoveryEmail: string | null;
  verified: boolean;
  mailConfigured: boolean;
}

export interface SetRecoveryEmailResult {
  recoveryEmail: string | null;
  verified: boolean;
  verificationSent: boolean;
}

export async function fetchRecoverySettings(): Promise<RecoverySettings> {
  const { data } = await api.get('/v1/recovery/me');
  return data;
}

export async function setRecoveryEmail(
  recoveryEmail: string | null,
): Promise<SetRecoveryEmailResult> {
  const { data } = await api.put('/v1/recovery/me', { recoveryEmail });
  return data;
}

export async function removeRecoveryEmail(): Promise<SetRecoveryEmailResult> {
  const { data } = await api.delete('/v1/recovery/me');
  return data;
}

export async function verifyRecoveryEmail(
  token: string,
): Promise<{ verified: true }> {
  const { data } = await api.post('/v1/recovery/verify', { token });
  return data;
}

export async function requestPasswordReset(
  email: string,
): Promise<{ success: true }> {
  const { data } = await api.post('/v1/recovery/request', { email });
  return data;
}

export async function resetPasswordWithToken(
  token: string,
  newPassword: string,
): Promise<{ success: true }> {
  const { data } = await api.post('/v1/recovery/reset', {
    token,
    newPassword,
  });
  return data;
}
