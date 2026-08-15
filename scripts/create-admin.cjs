#!/usr/bin/env node
/**
 * One-time CLI script to create the first admin user directly in CosmosDB.
 * Zero attack surface — runs locally against Azure, no public endpoint needed.
 *
 * Usage:
 *   node scripts/create-admin.cjs \
 *     --endpoint <COSMOS_ENDPOINT> \
 *     --key <COSMOS_KEY> \
 *     --database <COSMOS_DATABASE> \
 *     --email <EMAIL> \
 *     --password <PASSWORD> \
 *     --firstName <FIRST> \
 *     --lastName <LAST> \
 *     --organization <ORG> \
 *     --jobTitle <TITLE>
 */

const { CosmosClient } = require('@azure/cosmos');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, '');
    opts[key] = args[i + 1];
  }
  return opts;
}

async function main() {
  const opts = parseArgs();

  const required = ['endpoint', 'key', 'database', 'email', 'password', 'firstName', 'lastName', 'organization', 'jobTitle'];
  for (const field of required) {
    if (!opts[field]) {
      console.error(`Missing required argument: --${field}`);
      process.exit(1);
    }
  }

  const client = new CosmosClient({ endpoint: opts.endpoint, key: opts.key });
  const db = client.database(opts.database);

  // Check if users already exist
  const { resources: users } = await db.container('users').items
    .query('SELECT VALUE COUNT(1) FROM c')
    .fetchAll();
  const userCount = users[0] || 0;

  if (userCount > 0) {
    console.error(`Database already has ${userCount} user(s). This script is for first-user bootstrap only.`);
    process.exit(1);
  }

  const id = uuidv4();
  const passwordHash = bcrypt.hashSync(opts.password, 12);
  const now = new Date().toISOString();

  const userDoc = {
    id,
    email: opts.email.toLowerCase(),
    passwordHash,
    totpSecret: null,
    totpEnabled: false,
    isAdmin: true,
    isSuperadmin: true,
    forcePasswordChange: false,
    firstName: opts.firstName,
    lastName: opts.lastName,
    organization: opts.organization,
    jobTitle: opts.jobTitle,
    linkedinUrl: null,
    termsAcceptedAt: null,
    canGenerateInvites: true,
    emailVerified: true,
    limits: { dailyTokenLimit: 0, isSuspended: false, updatedBy: null },
    createdAt: now,
    updatedAt: now,
  };

  await db.container('users').items.create(userDoc);

  console.log('');
  console.log('Admin user created successfully!');
  console.log(`  Email:    ${opts.email}`);
  console.log(`  ID:       ${id}`);
  console.log(`  Admin:    true`);
  console.log(`  Superadmin: true`);
  console.log('');
  console.log('You can now log in at your XPIA Tools instance.');
}

main().catch((err) => {
  console.error('Failed to create admin user:', err.message);
  process.exit(1);
});
