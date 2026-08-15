import { setRepos, getRepos } from '../../server/src/db/repos';
import { createMockRepositories } from '../../server/src/db/repositories';
import { seedFromConfig } from './seed';

let initialized = false;

/** Wire in-memory repositories and seed providers/models/keys so the core runs without Azure/Cosmos. */
export async function initRuntime(): Promise<void> {
  if (initialized) return;
  setRepos(createMockRepositories());
  await seedFromConfig();
  initialized = true;
}

/** Reset runtime state — used by tests. */
export function resetRuntime(): void {
  initialized = false;
}

export { getRepos };
