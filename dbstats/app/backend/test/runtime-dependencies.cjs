const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

// These packages belong to the native build toolchain, not the running app.
const buildOnlyPackages = new Set(['node-gyp', 'tinyglobby', 'fdir', 'picomatch']);

async function checkRuntimeDependencies(directory) {
  const root = path.resolve(directory);
  const retained = [];
  function walk(modules) {
    for (const entry of fs.readdirSync(modules, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const location = path.join(modules, entry.name);
      if (entry.name.startsWith('@')) {
        walk(location);
        continue;
      }
      const manifest = path.join(location, 'package.json');
      if (fs.existsSync(manifest)) {
        const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8'));
        if (buildOnlyPackages.has(pkg.name)) retained.push(`${pkg.name}@${pkg.version}`);
      }
      const nested = path.join(location, 'node_modules');
      if (fs.existsSync(nested)) walk(nested);
    }
  }
  walk(path.join(root, 'node_modules'));
  assert.deepEqual(retained, [], 'native build tooling must not be shipped in the runtime');

  // Pruning must preserve every direct runtime dependency and the native driver.
  const runtimeRequire = createRequire(path.join(root, 'package.json'));
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  for (const name of Object.keys(manifest.dependencies)) runtimeRequire.resolve(name);
  const sqlite = runtimeRequire('sqlite3');
  const db = await new Promise((resolve, reject) => {
    const connection = new sqlite.Database(':memory:', error => error ? reject(error) : resolve(connection));
  });
  try {
    const row = await new Promise((resolve, reject) => {
      db.get('SELECT 42 AS value', (error, result) => error ? reject(error) : resolve(result));
    });
    assert.equal(row.value, 42);
  } finally {
    await new Promise((resolve, reject) => db.close(error => error ? reject(error) : resolve()));
  }
  console.log('PASS runtime excludes native build tooling and SQLite still queries');
}

module.exports = { checkRuntimeDependencies };
if (require.main === module) {
  if (process.argv.length !== 3) {
    console.error('usage: node runtime-dependencies.cjs <backend-directory>');
    process.exitCode = 2;
  } else {
    checkRuntimeDependencies(process.argv[2]).catch(error => {
      console.error(error.message);
      process.exitCode = 1;
    });
  }
}
