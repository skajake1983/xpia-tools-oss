// ── CosmosDB Container Initialization ───────────────────────────────────
// Creates all containers with proper partition keys, TTL policies, and indexing.
// Called from initCosmos() at startup.

import { Database, IndexingPolicy, ContainerRequest } from '@azure/cosmos';
import logger from '../logger';

interface ContainerDef {
  id: string;
  partitionKey: string;
  /** Default TTL in seconds (-1 = enabled but per-item, undefined = no TTL) */
  defaultTtl?: number;
  indexingPolicy?: IndexingPolicy;
}

/**
 * All CosmosDB containers used by the application.
 * Layout:
 *   users     – user profiles with embedded limits (/id)
 *   auth      – tokens, sessions, trusted devices (/userId) — TTL-enabled
 *   config    – providers, models, invites, prompts, etc. (/id)
 *   api-keys  – encrypted API keys (/userId)
 *   usage     – usage log entries (/userId)
 *   content   – generated documents/payloads (/userId)
 *   pages     – XPIA pages (/userId)
 */
const containers: ContainerDef[] = [
  {
    id: 'users',
    partitionKey: '/id',
  },
  {
    id: 'auth',
    partitionKey: '/userId',
    // TTL enabled — each item specifies its own ttl value
    defaultTtl: -1,
  },
  {
    id: 'config',
    partitionKey: '/id',
    // TTL enabled for audit log retention — items without ttl field are unaffected
    defaultTtl: -1,
    indexingPolicy: {
      includedPaths: [{ path: '/*' }],
      excludedPaths: [
        { path: '/"systemPrompt"/?' },
        { path: '/"userPrompt"/?' },
      ],
    },
  },
  {
    id: 'api-keys',
    partitionKey: '/userId',
    indexingPolicy: {
      includedPaths: [{ path: '/*' }],
      excludedPaths: [
        { path: '/"encryptedKey"/?' },
        { path: '/"keyIv"/?' },
        { path: '/"keyTag"/?' },
      ],
    },
  },
  {
    id: 'usage',
    partitionKey: '/userId',
    indexingPolicy: {
      includedPaths: [{ path: '/*' }],
      excludedPaths: [
        { path: '/"promptMessages"/?' },
        { path: '/"responseText"/?' },
        { path: '/"requestMeta"/?' },
      ],
    },
  },
  {
    id: 'content',
    partitionKey: '/userId',
  },
  {
    id: 'pages',
    partitionKey: '/userId',
  },
];

export async function initContainers(database: Database): Promise<void> {
  for (const def of containers) {
    const request: ContainerRequest = {
      id: def.id,
      partitionKey: { paths: [def.partitionKey] },
    };

    if (def.defaultTtl !== undefined) {
      request.defaultTtl = def.defaultTtl;
    }
    if (def.indexingPolicy) {
      request.indexingPolicy = def.indexingPolicy;
    }

    await database.containers.createIfNotExists(request);
    logger.debug({ container: def.id }, 'Container ensured');
  }

  logger.info({ count: containers.length }, 'All CosmosDB containers initialised');
}
