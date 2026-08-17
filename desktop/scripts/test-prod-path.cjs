// Verifies the PRODUCTION code path: run the COMPILED server (server/dist) with
// plain node — no tsx — exactly as the packaged app will. Not shipped.
process.env.NODE_ENV = 'development'; // desktop always uses dev secret defaults
process.env.LOG_LEVEL = 'silent';
process.env.XPIA_LOCAL_MODE = '1';
process.env.XPIA_NO_LOCAL_DOC_STORE = '1';
process.env.ENCRYPTION_KEY = require('crypto').randomBytes(32).toString('hex');

const path = require('path');
const distMain = path.resolve(__dirname, '../../server/dist/server/src/create-local-app');
const { bootstrapLocal, createLocalApp } = require(distMain);

(async () => {
  await bootstrapLocal();
  const app = createLocalApp();
  app.listen(4602, '127.0.0.1', () => {
    // eslint-disable-next-line no-console
    console.log('[prod-path] compiled server listening on 127.0.0.1:4602');
  });
})().catch((e) => {
  // eslint-disable-next-line no-console
  console.error('[prod-path] FAILED', e);
  process.exit(1);
});
