/**
 * Structured logger — pino-based, App Insights compatible.
 *
 * - JSON output in production (App Insights console bridge captures it)
 * - Pretty-printed in development via pino-pretty
 * - LOG_LEVEL env var controls verbosity (default: info)
 */

import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production';
// A silent logger emits nothing, so there's no reason to load the pino-pretty
// transport (a dev-only dependency) — this lets the standalone desktop build, which
// runs with LOG_LEVEL=silent, ship without pino-pretty. Output is unchanged in every
// case: production and silent both produce no pretty transport.
const usePretty = !isProduction && process.env.LOG_LEVEL !== 'silent';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  ...(usePretty
    ? { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } } }
    : {}),
  base: { service: 'xpia-tools' },
  formatters: {
    level: (label) => ({ level: label }),
  },
  // Redact sensitive fields that might appear in log context
  redact: ['apiKey', 'password', 'token', 'secret', 'encrypted_key', 'key_iv', 'key_tag'],
});

export default logger;
