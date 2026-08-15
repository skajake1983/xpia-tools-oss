/**
 * Seed script — creates test users directly in the database.
 * Run AFTER the server has initialized the DB at least once.
 *
 * Usage: npx tsx scripts/seed-test-users.ts
 */
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { authenticator } from 'otplib';
import db from '../src/db';
import { initializeDatabase } from '../src/db/schema';

// Initialize database (runs migrations, seeds providers)
interface TestUser {
  email: string;
  firstName: string;
  lastName: string;
  organization: string;
  jobTitle: string;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  canGenerateInvites: boolean;
}

const TEST_USERS: TestUser[] = [
  {
    email: 'superadmin@xpia.test',
    firstName: 'Jake',
    lastName: 'Founder',
    organization: 'XPIA Security',
    jobTitle: 'Founder & CEO',
    isAdmin: true,
    isSuperAdmin: true,
    canGenerateInvites: true,
  },
  {
    email: 'superadmin2@xpia.test',
    firstName: 'Sarah',
    lastName: 'Chen',
    organization: 'XPIA Security',
    jobTitle: 'CTO',
    isAdmin: true,
    isSuperAdmin: true,
    canGenerateInvites: true,
  },
  {
    email: 'admin@xpia.test',
    firstName: 'Alex',
    lastName: 'Morgan',
    organization: 'XPIA Security',
    jobTitle: 'Security Lead',
    isAdmin: true,
    isSuperAdmin: false,
    canGenerateInvites: true,
  },
  {
    email: 'admin2@xpia.test',
    firstName: 'Priya',
    lastName: 'Patel',
    organization: 'Acme Corp',
    jobTitle: 'Security Manager',
    isAdmin: true,
    isSuperAdmin: false,
    canGenerateInvites: true,
  },
  {
    email: 'user1@xpia.test',
    firstName: 'Jordan',
    lastName: 'Kim',
    organization: 'Red Team Labs',
    jobTitle: 'Penetration Tester',
    isAdmin: false,
    isSuperAdmin: false,
    canGenerateInvites: false,
  },
  {
    email: 'user2@xpia.test',
    firstName: 'Taylor',
    lastName: 'Brooks',
    organization: 'CyberDefense Inc',
    jobTitle: 'Security Researcher',
    isAdmin: false,
    isSuperAdmin: false,
    canGenerateInvites: false,
  },
  {
    email: 'user3@xpia.test',
    firstName: 'Mia',
    lastName: 'Williams',
    organization: 'TechGuard',
    jobTitle: 'ML Security Engineer',
    isAdmin: false,
    isSuperAdmin: false,
    canGenerateInvites: true,
  },
];

async function main(): Promise<void> {
  await initializeDatabase();

  const PASSWORD = process.env.SEED_PASSWORD || (() => {
    console.error('ERROR: Set SEED_PASSWORD environment variable (e.g. SEED_PASSWORD="YourPass1!" npx tsx scripts/seed-test-users.ts)');
    process.exit(1);
  })() as string;
  const BCRYPT_ROUNDS = 12;

  const passwordHash = bcrypt.hashSync(PASSWORD, BCRYPT_ROUNDS);

  console.log('\nSeeding test users...\n');

  await db.transaction(async () => {
    // First, claim the bootstrap invite code so new bootstrap codes aren't generated
    const bootstrap = await db.get<{ code: string }>("SELECT code FROM invite_codes WHERE created_by = 'SYSTEM' LIMIT 1");

    for (let i = 0; i < TEST_USERS.length; i++) {
      const u = TEST_USERS[i];
      const id = uuidv4();
      const totpSecret = authenticator.generateSecret();

      await db.run(
        `INSERT INTO users (id, email, password_hash, first_name, last_name, organization, job_title, is_admin, is_superadmin, can_generate_invites, totp_secret, totp_enabled)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        id, u.email, passwordHash,
        u.firstName, u.lastName, u.organization, u.jobTitle,
        u.isAdmin ? 1 : 0,
        u.isSuperAdmin ? 1 : 0,
        u.canGenerateInvites ? 1 : 0,
        totpSecret,
      );

      // Redeem bootstrap code for first user
      if (i === 0 && bootstrap) {
        await db.run('UPDATE invite_codes SET use_count = 1, used_by = ? WHERE code = ?', id, bootstrap.code);
      }

      // Create invite codes for subsequent users (as if first user invited them)
      if (i > 0) {
        const codeId = uuidv4();
        const code = `TEST${String(i).padStart(4, '0')}`;
        const firstUserId = await db.get<{ id: string }>("SELECT id FROM users WHERE email = 'superadmin@xpia.test'");
        await db.run(
          `INSERT INTO invite_codes (id, code, created_by, max_uses, use_count, used_by, note, invited_email, invited_first_name, invited_last_name)
           VALUES (?, ?, ?, 1, 1, ?, ?, ?, ?, ?)`,
          codeId, code, firstUserId!.id, id, `Test invite for ${u.firstName}`, u.email, u.firstName, u.lastName,
        );
      }

      console.log(`  ✓ ${u.email} (${u.isSuperAdmin ? 'SuperAdmin' : u.isAdmin ? 'Admin' : 'User'}) — TOTP secret: ${totpSecret}`);
    }
  });

  console.log(`\n╔══════════════════════════════════════════════════════════════╗`);
  console.log(`║  ${TEST_USERS.length} test users created                                       ║`);
  console.log(`║  Password (all): ${PASSWORD}                              ║`);
  console.log(`║  2FA is enabled — use the TOTP secrets above with an       ║`);
  console.log(`║  authenticator app or a TOTP generator to log in.          ║`);
  console.log(`╚══════════════════════════════════════════════════════════════╝`);
  console.log('');
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
