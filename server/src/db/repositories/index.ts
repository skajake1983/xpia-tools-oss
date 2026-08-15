// ── Repository Factory ──────────────────────────────────────────────────
// Creates the Repositories object for either CosmosDB (runtime) or Mock (tests).

import { Database } from '@azure/cosmos';
import type { Repositories } from './types';
import {
  CosmosUserRepo, CosmosAuthRepo, CosmosConfigRepo,
  CosmosApiKeyRepo, CosmosUsageRepo, CosmosContentRepo, CosmosPageRepo,
} from './cosmos';
import {
  MockUserRepo, MockAuthRepo, MockConfigRepo,
  MockApiKeyRepo, MockUsageRepo, MockContentRepo, MockPageRepo,
} from './mock';

export type { Repositories } from './types';

export function createCosmosRepositories(database: Database): Repositories {
  return {
    users: new CosmosUserRepo(database.container('users')),
    auth: new CosmosAuthRepo(database.container('auth')),
    config: new CosmosConfigRepo(database.container('config')),
    apiKeys: new CosmosApiKeyRepo(database.container('api-keys')),
    usage: new CosmosUsageRepo(database.container('usage')),
    content: new CosmosContentRepo(database.container('content')),
    pages: new CosmosPageRepo(database.container('pages')),
  };
}

export function createMockRepositories(): Repositories {
  return {
    users: new MockUserRepo(),
    auth: new MockAuthRepo(),
    config: new MockConfigRepo(),
    apiKeys: new MockApiKeyRepo(),
    usage: new MockUsageRepo(),
    content: new MockContentRepo(),
    pages: new MockPageRepo(),
  };
}
