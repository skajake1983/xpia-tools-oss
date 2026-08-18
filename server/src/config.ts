import 'dotenv/config';
import crypto from 'crypto';

// Generate a deterministic dev-only encryption key (never use in production)
function devEncryptionKey(): string {
  return crypto.scryptSync('dev-local-only', 'dev-salt', 32).toString('hex');
}

// Generate random dev-only JWT secrets per process start (never use in production)
const devJwtSecret = crypto.randomBytes(32).toString('hex');
const devRefreshSecret = crypto.randomBytes(32).toString('hex');

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  jwt: {
    secret: process.env.JWT_SECRET || devJwtSecret,
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET || devRefreshSecret,
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  /** Public marketing site for user-facing links (e.g. the removed-page screen). Falls back to the
   *  client URL on the hosted app; the desktop sets PUBLIC_SITE_URL to the real site. */
  publicSiteUrl: process.env.PUBLIC_SITE_URL || process.env.CLIENT_URL || 'http://localhost:5173',
  bcryptRounds: 12,
  /** 64-char hex string (32 bytes) for AES-256-GCM encryption of API keys */
  encryptionKey: process.env.ENCRYPTION_KEY || devEncryptionKey(),
  /** Default per-user limits (overridable per user via admin) */
  defaultLimits: {
    dailyTokenLimit: parseInt(process.env.DEFAULT_DAILY_TOKEN_LIMIT || '500000', 10),
  },
  /** Maximum allowed input length to send to any LLM (in characters) */
  maxLlmInputLength: parseInt(process.env.MAX_LLM_INPUT_LENGTH || '50000', 10),
  /** Public pages domain — where generated web pages are served */
  publicPagesDomain: process.env.PUBLIC_PAGES_DOMAIN || '',
  /** Azure Blob Storage connection string for uploading public pages */
  azureStorageConnectionString: process.env.AZURE_STORAGE_CONNECTION_STRING || '',
  /** Azure Blob Storage container name for the $web static site */
  azureStorageContainer: process.env.AZURE_STORAGE_CONTAINER || '$web',
  /** Maximum number of web pages a single user can create */
  maxPagesPerUser: parseInt(process.env.MAX_PAGES_PER_USER || '50', 10),
  /** Azure Communication Services Email */
  email: {
    connectionString: process.env.AZURE_COMMUNICATION_CONNECTION_STRING || '',
    senderAddress: process.env.EMAIL_SENDER_ADDRESS || '',
  },
  /** GitHub API — for creating issues from in-app feedback */
  github: {
    token: process.env.GITHUB_TOKEN || '',
    repo: process.env.GITHUB_REPO || '', // format: owner/repo
  },
  /** Azure CosmosDB */
  cosmos: {
    endpoint: process.env.COSMOS_ENDPOINT || 'https://localhost:8081',
    key: process.env.COSMOS_KEY || 'C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw==',
    databaseId: process.env.COSMOS_DATABASE || 'xpia-tools',
  },
} as const;

// ── Production safety guard ─────────────────────────────────────────────
if (config.nodeEnv === 'production') {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is required in production');
  }
  if (!process.env.JWT_REFRESH_SECRET) {
    throw new Error('JWT_REFRESH_SECRET environment variable is required in production');
  }
  if (!process.env.ENCRYPTION_KEY) {
    throw new Error('ENCRYPTION_KEY environment variable is required in production');
  }
}
