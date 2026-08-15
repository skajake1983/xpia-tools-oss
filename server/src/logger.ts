/**
 * Structured logger — pino-based, App Insights compatible.
 *
 * - JSON output in production (App Insights console bridge captures it)
 * - Pretty-printed in development via pino-pretty
 * - LOG_LEVEL env var controls verbosity (default: info)
 */

import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  ...(isProduction
    ? {}
    : { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } } }),
  base: { service: 'xpia-tools' },
  formatters: {
    level: (label) => ({ level: label }),
  },
  // Redact sensitive fields that might appear in log context
  redact: ['apiKey', 'password', 'token', 'secret', 'encrypted_key', 'key_iv', 'key_tag'],
});

export default logger;
