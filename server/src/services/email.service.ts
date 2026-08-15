import { EmailClient } from '@azure/communication-email';
import { config } from '../config';
import repos from '../db/repos';
import logger from '../logger';

let emailClient: EmailClient | null = null;

function getClient(): EmailClient | null {
  if (emailClient) return emailClient;
  if (!config.email.connectionString) return null;
  emailClient = new EmailClient(config.email.connectionString);
  return emailClient;
}

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  plainText?: string;
}

export async function sendEmail(options: EmailOptions): Promise<boolean> {
  const client = getClient();

  if (!client) {
    // Dev mode — log to console
    logger.info({ to: options.to, subject: options.subject }, 'Email (dev mode — no ACS configured)');
    return false;
  }

  const poller = await client.beginSend({
    senderAddress: config.email.senderAddress,
    content: {
      subject: options.subject,
      html: options.html,
      plainText: options.plainText,
    },
    recipients: {
      to: [{ address: options.to }],
    },
  });

  const result = await poller.pollUntilDone();
  return result.status === 'Succeeded';
}

export async function sendPasswordResetEmail(
  to: string,
  resetUrl: string,
): Promise<boolean> {
  return sendEmail({
    to,
    subject: 'XPIA Tools — Password Reset',
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
        <h2 style="color: #111; margin-bottom: 16px;">Password Reset</h2>
        <p style="color: #444; line-height: 1.6;">
          You requested a password reset for your XPIA Tools account. Click the button below to set a new password.
        </p>
        <a href="${resetUrl}" style="display: inline-block; background: #2563eb; color: #fff; text-decoration: none; padding: 12px 28px; border-radius: 6px; margin: 24px 0; font-weight: 500;">
          Reset Password
        </a>
        <p style="color: #888; font-size: 13px; line-height: 1.5;">
          This link expires in 1 hour. If you didn't request this, you can safely ignore this email.
        </p>
        <p style="color: #aaa; font-size: 12px; margin-top: 32px; border-top: 1px solid #eee; padding-top: 16px;">
          XPIA Tools — Cross-Plugin Injection Attack Research
        </p>
      </div>
    `,
    plainText: `Password Reset\n\nYou requested a password reset for your XPIA Tools account.\n\nReset your password: ${resetUrl}\n\nThis link expires in 1 hour. If you didn't request this, ignore this email.`,
  });
}

export async function sendVerificationEmail(
  to: string,
  verifyUrl: string,
  firstName: string,
): Promise<boolean> {
  return sendEmail({
    to,
    subject: 'XPIA Tools — Verify Your Email',
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
        <h2 style="color: #111; margin-bottom: 16px;">Welcome, ${firstName}!</h2>
        <p style="color: #444; line-height: 1.6;">
          Thanks for creating your XPIA Tools account. Please verify your email address by clicking the button below.
        </p>
        <a href="${verifyUrl}" style="display: inline-block; background: #2563eb; color: #fff; text-decoration: none; padding: 12px 28px; border-radius: 6px; margin: 24px 0; font-weight: 500;">
          Verify Email
        </a>
        <p style="color: #888; font-size: 13px; line-height: 1.5;">
          This link expires in 24 hours. If you didn't create this account, you can safely ignore this email.
        </p>
        <p style="color: #aaa; font-size: 12px; margin-top: 32px; border-top: 1px solid #eee; padding-top: 16px;">
          XPIA Tools — Cross-Plugin Injection Attack Research
        </p>
      </div>
    `,
    plainText: `Welcome, ${firstName}!\n\nThanks for creating your XPIA Tools account. Please verify your email address.\n\nVerify: ${verifyUrl}\n\nThis link expires in 24 hours.`,
  });
}

export async function sendNewInviteRequestEmail(
  requesterName: string,
  requesterEmail: string,
  organization: string,
  jobTitle: string,
): Promise<void> {
  const adminUsers = await repos.users.list({ search: '', limit: 1000 });
  const admins = adminUsers.filter(u => u.isAdmin).map(u => ({ email: u.email }));

  if (admins.length === 0) return;

  const reviewUrl = `${config.clientUrl}/admin?tab=invite-requests`;

  for (const admin of admins) {
    sendEmail({
      to: admin.email,
      subject: 'XPIA Tools — New Invite Request',
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
          <h2 style="color: #111; margin-bottom: 16px;">New Invite Request</h2>
          <p style="color: #444; line-height: 1.6;">
            A new user has requested access to XPIA Tools.
          </p>
          <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
            <tr><td style="color: #888; padding: 4px 8px 4px 0;">Name</td><td style="color: #111; padding: 4px 0;">${requesterName}</td></tr>
            <tr><td style="color: #888; padding: 4px 8px 4px 0;">Email</td><td style="color: #111; padding: 4px 0;">${requesterEmail}</td></tr>
            <tr><td style="color: #888; padding: 4px 8px 4px 0;">Organization</td><td style="color: #111; padding: 4px 0;">${organization}</td></tr>
            <tr><td style="color: #888; padding: 4px 8px 4px 0;">Job Title</td><td style="color: #111; padding: 4px 0;">${jobTitle}</td></tr>
          </table>
          <a href="${reviewUrl}" style="display: inline-block; background: #2563eb; color: #fff; text-decoration: none; padding: 12px 28px; border-radius: 6px; margin: 16px 0; font-weight: 500;">
            Review Request
          </a>
          <p style="color: #aaa; font-size: 12px; margin-top: 32px; border-top: 1px solid #eee; padding-top: 16px;">
            XPIA Tools — Cross-Plugin Injection Attack Research
          </p>
        </div>
      `,
      plainText: `New Invite Request\n\nName: ${requesterName}\nEmail: ${requesterEmail}\nOrganization: ${organization}\nJob Title: ${jobTitle}\n\nReview: ${reviewUrl}`,
    }).catch((err) => logger.error({ adminEmail: admin.email, err }, 'Failed to notify admin of invite request'));
  }
}

export async function sendUserMilestoneEmail(
  to: string,
  userCount: number,
): Promise<boolean> {
  const adminUrl = `${config.clientUrl}/admin`;

  return sendEmail({
    to,
    subject: `XPIA Tools — ${userCount} Users Milestone`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
        <h2 style="color: #111; margin-bottom: 16px;">🎉 ${userCount} Users</h2>
        <p style="color: #444; line-height: 1.6;">
          XPIA Tools has reached <strong>${userCount} registered users</strong>.
        </p>
        <p style="color: #444; line-height: 1.6;">
          If growth is outpacing expectations, you can enable the invite system from the admin panel to control new registrations.
        </p>
        <a href="${adminUrl}" style="display: inline-block; background: #2563eb; color: #fff; text-decoration: none; padding: 12px 28px; border-radius: 6px; margin: 24px 0; font-weight: 500;">
          Open Admin Panel
        </a>
        <p style="color: #aaa; font-size: 12px; margin-top: 32px; border-top: 1px solid #eee; padding-top: 16px;">
          XPIA Tools — Cross-Plugin Injection Attack Research
        </p>
      </div>
    `,
    plainText: `XPIA Tools has reached ${userCount} registered users.\n\nIf growth is outpacing expectations, you can enable the invite system from the admin panel.\n\nAdmin: ${adminUrl}`,
  });
}

export async function sendInviteApprovedEmail(
  to: string,
  inviteCode: string,
  firstName: string,
): Promise<boolean> {
  const registerUrl = `${config.clientUrl}/register?code=${encodeURIComponent(inviteCode)}`;

  return sendEmail({
    to,
    subject: 'XPIA Tools — Your Invite Has Been Approved!',
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
        <h2 style="color: #111; margin-bottom: 16px;">Welcome, ${firstName}!</h2>
        <p style="color: #444; line-height: 1.6;">
          Your request to join XPIA Tools has been approved. Click the button below to create your account.
        </p>
        <a href="${registerUrl}" style="display: inline-block; background: #2563eb; color: #fff; text-decoration: none; padding: 12px 28px; border-radius: 6px; margin: 24px 0; font-weight: 500;">
          Create Account
        </a>
        <p style="color: #666; font-size: 14px; line-height: 1.5;">
          Your invite code: <strong>${inviteCode}</strong>
        </p>
        <p style="color: #888; font-size: 13px; line-height: 1.5;">
          This invite expires in 7 days. Use it to register with the same email you requested access with.
        </p>
        <p style="color: #aaa; font-size: 12px; margin-top: 32px; border-top: 1px solid #eee; padding-top: 16px;">
          XPIA Tools — Cross-Plugin Injection Attack Research
        </p>
      </div>
    `,
    plainText: `Welcome, ${firstName}!\n\nYour request to join XPIA Tools has been approved.\n\nCreate your account: ${registerUrl}\n\nYour invite code: ${inviteCode}\n\nThis invite expires in 7 days.`,
  });
}
