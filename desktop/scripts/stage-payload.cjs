// Assembles desktop/payload/ — the server + client that ship *inside* app.asar.
//
// Two wins over the old "copy the whole server/node_modules as extraResources":
//   1) a PRODUCTION-only install (no dev deps), and
//   2) dropping the cloud/telemetry packages the desktop never loads at runtime.
// Combined with asar packing (electron-builder.yml), this cuts the installer's file
// count roughly in half, so NSIS unpacks it far faster and more smoothly.
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const desktopDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(desktopDir, '..');
const serverDir = path.join(repoRoot, 'server');
const clientDist = path.join(repoRoot, 'client', 'dist');
const payload = path.join(desktopDir, 'payload');
const payloadServer = path.join(payload, 'server');

// Cloud/telemetry packages the desktop never loads at runtime, verified against the
// source:
//   - @azure/cosmos: local mode uses createMockRepositories(); every Cosmos import is
//     a type-only annotation that TypeScript elides from the compiled JS.
//   - applicationinsights (+ its @opentelemetry / @azure/monitor-opentelemetry / @grpc
//     tree): only require()'d when APPLICATIONINSIGHTS_CONNECTION_STRING is set, which
//     it never is in the desktop.
const DROP = [
  path.join('@azure', 'cosmos'),
  path.join('@azure', 'monitor-opentelemetry'),
  '@opentelemetry',
  '@grpc',
  'applicationinsights',
];

const log = (m) => process.stdout.write(`[stage-payload] ${m}\n`);

function dirStats(dir) {
  let files = 0;
  let bytes = 0;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else {
        files++;
        try {
          bytes += fs.statSync(p).size;
        } catch {
          /* ignore */
        }
      }
    }
  };
  walk(dir);
  return { files, mb: bytes / 1024 / 1024 };
}

// 1. Clean
fs.rmSync(payload, { recursive: true, force: true });
fs.mkdirSync(payloadServer, { recursive: true });

// 2. Copy built server + client
log('copying server/dist + client/dist');
fs.cpSync(path.join(serverDir, 'dist'), path.join(payloadServer, 'dist'), { recursive: true });
fs.cpSync(clientDist, path.join(payload, 'client', 'dist'), { recursive: true });

// 3. Production-only server dependencies (fresh, isolated install)
log('installing production server dependencies (npm ci --omit=dev)…');
fs.copyFileSync(path.join(serverDir, 'package.json'), path.join(payloadServer, 'package.json'));
fs.copyFileSync(path.join(serverDir, 'package-lock.json'), path.join(payloadServer, 'package-lock.json'));
execSync('npm ci --omit=dev --no-audit --no-fund --loglevel=error', {
  cwd: payloadServer,
  stdio: 'inherit',
});

// 4. Drop the cloud/telemetry trees the desktop never loads
const nm = path.join(payloadServer, 'node_modules');
for (const rel of DROP) {
  const p = path.join(nm, rel);
  if (fs.existsSync(p)) {
    fs.rmSync(p, { recursive: true, force: true });
    log(`dropped ${rel}`);
  }
}

const stats = dirStats(nm);
log(`payload server/node_modules: ${stats.files.toLocaleString()} files, ${stats.mb.toFixed(0)} MB`);
log('done.');
