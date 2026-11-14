import { createHash } from 'node:crypto';
import { RecoveryService } from '../src/modules/recovery/recovery.service';
import { createFakeRepository } from './fakes/repository.fake';

interface MailCall {
  to: string;
  subject: string;
  text: string;
  html: string;
}

function tokenFrom(message: MailCall): string {
  const match = /[?&]token=([^&\s]+)/.exec(message.text);
  if (!match) throw new Error('Mail did not contain a token link');
  return decodeURIComponent(match[1]);
}

function hash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function createService(options?: {
  mailConfigured?: boolean;
  users?: Record<string, any>[];
  recovery?: Record<string, any>[];
}) {
  const users = options?.users ?? [
    {
      userId: 'u1',
      username: 'alice',
      email: 'alice@wmsu.edu.ph',
      isActive: true,
    },
  ];

  const userRepo = createFakeRepository(users, { idKey: 'userId' });
  const recoveryRepo = createFakeRepository(options?.recovery ?? [], {
    idKey: 'userId',
  });

  const mail = {
    isConfigured: jest.fn(() => options?.mailConfigured ?? true),
    getAppUrl: jest.fn(() => 'https://coe-nnect.test'),
    send: jest.fn(async (_message: MailCall) => undefined),
  };

  const updateUserById = jest.fn(async () => ({
    data: { user: { id: 'u1' } },
    error: null,
  }));
  const supabase = {
    getAdminClient: () => ({
      auth: { admin: { updateUserById } },
    }),
  };

  return {
    service: new RecoveryService(
      supabase as any,
      mail as any,
      userRepo as any,
      recoveryRepo as any,
    ),
    userRepo,
    recoveryRepo,
    mail,
    updateUserById,
  };
}

describe('RecoveryService', () => {
  it('stores a pending recovery address and emails a hashed verification token', async () => {
    const { service, recoveryRepo, mail } = createService();

    const result = await service.setRecoveryEmail(
      'u1',
      ' Personal@Example.com ',
    );

    expect(result).toEqual({
      recoveryEmail: 'personal@example.com',
      verified: false,
      verificationSent: true,
    });
    expect(mail.send).toHaveBeenCalledTimes(1);

    const message = mail.send.mock.calls[0][0] as MailCall;
    expect(message.to).toBe('personal@example.com');
    const token = tokenFrom(message);
    expect(recoveryRepo.rows[0].verificationTokenHash).toBe(hash(token));
    expect(recoveryRepo.rows[0].verificationTokenHash).not.toBe(token);
  });

  it('verifies a recovery address once and consumes the token', async () => {
    const { service, recoveryRepo, mail } = createService();

    await service.setRecoveryEmail('u1', 'personal@example.com');
    const token = tokenFrom(mail.send.mock.calls[0][0] as MailCall);

    await expect(service.verifyRecoveryEmail(token)).resolves.toEqual({
      verified: true,
    });
    expect(recoveryRepo.rows[0].verifiedAt).toBeInstanceOf(Date);
    expect(recoveryRepo.rows[0].verificationTokenHash).toBeNull();

    await expect(service.verifyRecoveryEmail(token)).rejects.toThrow(
      /invalid or has expired/i,
    );
  });

  it('rejects an expired verification token', async () => {
    const { service, recoveryRepo, mail } = createService();

    await service.setRecoveryEmail('u1', 'personal@example.com');
    const token = tokenFrom(mail.send.mock.calls[0][0] as MailCall);
    recoveryRepo.rows[0].verificationTokenExpiresAt = new Date(Date.now() - 1);

    await expect(service.verifyRecoveryEmail(token)).rejects.toThrow(
      /invalid or has expired/i,
    );
  });

  it('sends a reset link to a verified recovery address and updates the password once', async () => {
    const { service, mail, recoveryRepo, updateUserById } = createService();

    await service.setRecoveryEmail('u1', 'personal@example.com');
    const verifyToken = tokenFrom(mail.send.mock.calls[0][0] as MailCall);
    await service.verifyRecoveryEmail(verifyToken);

    await expect(
      service.requestPasswordReset('personal@example.com'),
    ).resolves.toEqual({ success: true });

    const resetMessage = mail.send.mock.calls[1][0] as MailCall;
    expect(resetMessage.to).toBe('personal@example.com');
    const resetToken = tokenFrom(resetMessage);

    await expect(
      service.resetPassword(resetToken, 'NewPass@123'),
    ).resolves.toEqual({ success: true });
    expect(updateUserById).toHaveBeenCalledWith('u1', {
      password: 'NewPass@123',
    });
    expect(recoveryRepo.rows[0].resetTokenHash).toBeNull();

    await expect(
      service.resetPassword(resetToken, 'Another@123'),
    ).rejects.toThrow(/invalid or has expired/i);
  });

  it('sends a reset link to the login email when no recovery address is set', async () => {
    const { service, mail } = createService();

    await service.requestPasswordReset('alice@wmsu.edu.ph');

    expect(mail.send).toHaveBeenCalledTimes(1);
    const message = mail.send.mock.calls[0][0] as MailCall;
    expect(message.to).toBe('alice@wmsu.edu.ph');
    expect(tokenFrom(message)).toBeTruthy();
  });

  it('answers generically for unknown addresses without sending mail', async () => {
    const { service, mail } = createService();

    await expect(
      service.requestPasswordReset('nobody@example.com'),
    ).resolves.toEqual({ success: true });
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('matches a login email case-insensitively', async () => {
    const { service, mail } = createService();

    await service.requestPasswordReset('ALICE@WMSU.EDU.PH');

    expect(mail.send).toHaveBeenCalledTimes(1);
    const message = mail.send.mock.calls[0][0] as MailCall;
    expect(message.to).toBe('alice@wmsu.edu.ph');
  });

  it('ignores an unverified claim on a verified recovery address', async () => {
    const { service, mail, recoveryRepo } = createService({
      users: [
        {
          userId: 'u1',
          username: 'alice',
          email: 'alice@wmsu.edu.ph',
          isActive: true,
        },
        {
          userId: 'u2',
          username: 'bob',
          email: 'bob@wmsu.edu.ph',
          isActive: true,
        },
      ],
      recovery: [
        {
          userId: 'u1',
          recoveryEmail: 'shared@example.com',
          verifiedAt: new Date(),
          verificationTokenHash: null,
          verificationTokenExpiresAt: null,
          resetTokenHash: null,
          resetTokenExpiresAt: null,
        },
        {
          userId: 'u2',
          recoveryEmail: 'shared@example.com',
          verifiedAt: null,
          verificationTokenHash: null,
          verificationTokenExpiresAt: null,
          resetTokenHash: null,
          resetTokenExpiresAt: null,
        },
      ],
    });

    await service.requestPasswordReset('shared@example.com');

    expect(mail.send).toHaveBeenCalledTimes(1);
    const message = mail.send.mock.calls[0][0] as MailCall;
    expect(message.to).toBe('shared@example.com');
    expect(
      recoveryRepo.rows.find((row) => row.userId === 'u1')?.resetTokenHash,
    ).toBeTruthy();
    expect(
      recoveryRepo.rows.find((row) => row.userId === 'u2')?.resetTokenHash,
    ).toBeFalsy();
  });

  it('does not let users set their login email as the recovery address', async () => {
    const { service } = createService();

    await expect(
      service.setRecoveryEmail('u1', 'alice@wmsu.edu.ph'),
    ).rejects.toThrow(/different from your login email/i);
  });

  it('disables recovery changes when SMTP is not configured', async () => {
    const { service } = createService({ mailConfigured: false });

    await expect(
      service.setRecoveryEmail('u1', 'personal@example.com'),
    ).rejects.toThrow(/not configured/i);
    await expect(
      service.requestPasswordReset('alice@wmsu.edu.ph'),
    ).rejects.toThrow(/not configured/i);
  });

  it('still removes a recovery address when SMTP is not configured', async () => {
    const { service, recoveryRepo } = createService({
      mailConfigured: false,
      recovery: [
        {
          userId: 'u1',
          recoveryEmail: 'personal@example.com',
          verifiedAt: new Date(),
          verificationTokenHash: 'verification-hash',
          verificationTokenExpiresAt: new Date(Date.now() + 60_000),
          resetTokenHash: 'reset-hash',
          resetTokenExpiresAt: new Date(Date.now() + 60_000),
        },
      ],
    });

    await expect(service.setRecoveryEmail('u1', null)).resolves.toEqual({
      recoveryEmail: null,
      verified: false,
      verificationSent: false,
    });
    expect(recoveryRepo.rows[0].recoveryEmail).toBeNull();
    expect(recoveryRepo.rows[0].verifiedAt).toBeNull();
    expect(recoveryRepo.rows[0].verificationTokenHash).toBeNull();
    expect(recoveryRepo.rows[0].resetTokenHash).toBeNull();
  });

  it('refuses to reset the password of a deactivated account', async () => {
    const token = 'a'.repeat(32);
    const { service, updateUserById } = createService({
      users: [
        {
          userId: 'u1',
          username: 'alice',
          email: 'alice@wmsu.edu.ph',
          isActive: false,
        },
      ],
      recovery: [
        {
          userId: 'u1',
          recoveryEmail: null,
          verifiedAt: null,
          verificationTokenHash: null,
          verificationTokenExpiresAt: null,
          resetTokenHash: hash(token),
          resetTokenExpiresAt: new Date(Date.now() + 60_000),
        },
      ],
    });

    await expect(
      service.resetPassword(token, 'NewPass@123'),
    ).rejects.toThrow(/invalid or has expired/i);
    expect(updateUserById).not.toHaveBeenCalled();
  });
});
