// Keep generation stateless and quiet during tests (mirrors preload.ts).
import { join } from 'path';
import { tmpdir } from 'os';

process.env.LOG_LEVEL = 'silent';
process.env.XPIA_NO_LOCAL_DOC_STORE = '1';
// Isolate tests from any real ~/.xpia/config.json on the dev machine.
process.env.XPIA_CONFIG_PATH = join(tmpdir(), 'xpia-cli-test-config-does-not-exist.json');
