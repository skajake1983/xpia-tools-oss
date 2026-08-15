import { CosmosClient, Database } from '@azure/cosmos';
import { config } from '../config';
import logger from '../logger';
import { initContainers } from './containers';

let client: CosmosClient;
let database: Database;

const isEmulator = config.cosmos.endpoint.includes('localhost') || config.cosmos.endpoint.includes('127.0.0.1');

export function getClient(): CosmosClient {
  if (!client) throw new Error('CosmosDB not initialised — call initCosmos() first');
  return client;
}

export function getDatabase(): Database {
  if (!database) throw new Error('CosmosDB not initialised — call initCosmos() first');
  return database;
}

export async function initCosmos(): Promise<void> {
  const options: ConstructorParameters<typeof CosmosClient>[0] = {
    endpoint: config.cosmos.endpoint,
    key: config.cosmos.key,
  };

  // The emulator uses a self-signed certificate — disable TLS verification for local dev only
  if (isEmulator) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    logger.info('CosmosDB: using local emulator (TLS verification disabled)');
  }

  client = new CosmosClient(options);

  const { database: db } = await client.databases.createIfNotExists({ id: config.cosmos.databaseId });
  database = db;
  logger.info({ databaseId: config.cosmos.databaseId, endpoint: config.cosmos.endpoint }, 'CosmosDB connected');

  await initContainers(database);
}
