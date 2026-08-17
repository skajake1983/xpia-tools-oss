// Imported FIRST (before any server module) so env is set before server/config
// loads. Enables single-user local mode and keeps generation stateless.
if (!process.env.NODE_ENV) process.env.NODE_ENV = 'development';
if (!process.env.LOG_LEVEL) process.env.LOG_LEVEL = 'silent';
process.env.XPIA_LOCAL_MODE = '1';
if (!process.env.XPIA_NO_LOCAL_DOC_STORE) process.env.XPIA_NO_LOCAL_DOC_STORE = '1';
