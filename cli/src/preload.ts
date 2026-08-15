// Imported first (before any server modules) so env is set before the logger/config load.
// Quiets the server's pino logger and keeps generation stateless (no local doc-store writes).
if (!process.env.LOG_LEVEL) process.env.LOG_LEVEL = 'silent';
if (!process.env.XPIA_NO_LOCAL_DOC_STORE) process.env.XPIA_NO_LOCAL_DOC_STORE = '1';
