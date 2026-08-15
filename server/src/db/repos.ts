// ── Repository Singleton ────────────────────────────────────────────────
// Global repository instance initialized at startup.
// Services import `repos` from this module instead of the old `db` module.

import type { Repositories } from './repositories/types';

let _repos: Repositories;

export function setRepos(repos: Repositories): void {
  _repos = repos;
}

export function getRepos(): Repositories {
  if (!_repos) throw new Error('Repositories not initialised — call setRepos() first');
  return _repos;
}

/** Shorthand for getRepos() — mirrors the old `db` default export pattern */
const repos: Repositories = new Proxy({} as Repositories, {
  get(_target, prop) {
    return getRepos()[prop as keyof Repositories];
  },
});

export default repos;
