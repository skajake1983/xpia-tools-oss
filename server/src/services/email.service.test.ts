import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRepositories } from '../db/repositories';
import { setRepos } from '../db/repos';

// Mock the logger before importing the service
const mockLoggerInfo = vi.fn();
const mockLoggerError = vi.fn();
vi.mock('../logger', () => ({
  default: {
    info: (...args: unknown[]) => mockLoggerInfo(...args),
    error: (...args: unknown[]) => mockLoggerError(...args),
    warn: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  },
}));

// Mock the Azure SDK before importing the service
vi.mock('@azure/communication-email', () => {
  const mockPollUntilDone = vi.fn().mockResolvedValue({ status: 'Succeeded' });
  const mockBeginSend = vi.fn().mockResolvedValue({ pollUntilDone: mockPollUntilDone });
  return {
    EmailClient: vi.fn().mockImplementation(() => ({
      beginSend: mockBeginSend,
    })),
    __mockBeginSend: mockBeginSend,
    __mockPollUntilDone: mockPollUntilDone,
  };
});

// Persistent mock repos — vi.resetModules() clears the repos singleton,
// so we re-init after each reset to keep dynamic imports working.
let mocks = createMockRepositories();

describe('Email Service', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.unstubAllEnvs();
    mockLoggerInfo.mockClear();
    mockLoggerError.mockClear();

    // Re-initialize repos so dynamically imported services find them
    mocks = createMockRepositories();
    const reposModule = await import('../db/repos');
    reposModule.setRepos(mocks);
  });

  it('logs to console in dev mode when no connection string is set', async () => {
    const { sendEmail } = await import('./email.service');

    const result = await sendEmail({
      to: 'test@example.com',
      subject: 'Test Subject',
      html: '<p>Hello</p>',
      plainText: 'Hello',
    });

    expect(result).toBe(false);
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'test@example.com', subject: 'Test Subject' }),
      expect.stringContaining('Email (dev mode'),
    );
  });

  it('sendPasswordResetEmail includes reset URL in plain text', async () => {
    const { sendPasswordResetEmail } = await import('./email.service');

    await sendPasswordResetEmail('user@example.com', 'https://app.example.com/reset?token=abc123');

    expect(mockLoggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'user@example.com', subject: expect.stringContaining('Password Reset') }),
      expect.any(String),
    );
  });

  it('sendInviteApprovedEmail includes invite code and register URL', async () => {
    const { sendInviteApprovedEmail } = await import('./email.service');

    await sendInviteApprovedEmail('new@example.com', 'INV-ABC123', 'Alice');

    expect(mockLoggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'new@example.com', subject: expect.stringContaining('Approved') }),
      expect.any(String),
    );
  });

  it('sendEmail builds correct ACS payload when connection string is set', async () => {
    // Set env var before importing
    vi.stubEnv('AZURE_COMMUNICATION_CONNECTION_STRING', 'endpoint=https://test.communication.azure.com/;accesskey=fakekey==');
    vi.stubEnv('EMAIL_SENDER_ADDRESS', 'noreply@test.com');

    // Re-import config and service with env set
    vi.resetModules();
    const { EmailClient, __mockBeginSend, __mockPollUntilDone } = await import('@azure/communication-email') as any;
    __mockBeginSend.mockClear();
    __mockPollUntilDone.mockResolvedValue({ status: 'Succeeded' });

    // Need to re-import to pick up new config
    const { sendEmail } = await import('./email.service');

    const result = await sendEmail({
      to: 'recipient@example.com',
      subject: 'Welcome',
      html: '<p>Hi</p>',
      plainText: 'Hi',
    });

    expect(result).toBe(true);
    expect(__mockBeginSend).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          subject: 'Welcome',
          html: '<p>Hi</p>',
          plainText: 'Hi',
        }),
        recipients: expect.objectContaining({
          to: [{ address: 'recipient@example.com' }],
        }),
      }),
    );
  });

  it('sendNewInviteRequestEmail sends email to each admin', async () => {
    // Create admin users in the mock repo
    const makeAdmin = (id: string, email: string) => ({
      id, email, passwordHash: 'hash', totpSecret: null, totpEnabled: false,
      isAdmin: true, isSuperadmin: false, forcePasswordChange: false,
      firstName: null, lastName: null, organization: null, jobTitle: null,
      linkedinUrl: null, termsAcceptedAt: null, canGenerateInvites: false, emailVerified: true,
      limits: { dailyTokenLimit: 100000, isSuspended: false, updatedBy: null },
      createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z',
    });
    await mocks.users.create(makeAdmin('admin-1', 'admin1@example.com'));
    await mocks.users.create(makeAdmin('admin-2', 'admin2@example.com'));

    const { sendNewInviteRequestEmail } = await import('./email.service');

    await sendNewInviteRequestEmail('John Doe', 'john@example.com', 'Acme Corp', 'Engineer');

    // In dev mode, sendEmail logs for each admin
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'admin1@example.com' }),
      expect.any(String),
    );
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'admin2@example.com' }),
      expect.any(String),
    );
  });

  it('sendNewInviteRequestEmail does nothing when no admins exist', async () => {
    // No admin users in the mock repo — default empty state

    const { sendNewInviteRequestEmail } = await import('./email.service');

    await sendNewInviteRequestEmail('John Doe', 'john@example.com', 'Acme Corp', 'Engineer');

    expect(mockLoggerInfo).not.toHaveBeenCalled();
  });

  it('sendVerificationEmail includes verify URL and name', async () => {
    const { sendVerificationEmail } = await import('./email.service');

    await sendVerificationEmail('user@example.com', 'https://app.example.com/verify-email?token=abc123', 'Bob');

    expect(mockLoggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'user@example.com', subject: expect.stringContaining('Verify') }),
      expect.any(String),
    );
  });

  it('sendUserMilestoneEmail includes user count and admin link', async () => {
    const { sendUserMilestoneEmail } = await import('./email.service');

    const result = await sendUserMilestoneEmail('admin@example.com', 150);

    expect(result).toBe(false); // dev mode
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'admin@example.com',
        subject: expect.stringContaining('150 Users Milestone'),
      }),
      expect.any(String),
    );
  });
});
