import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Logger } from '@nestjs/common';
import { ConfigService } from './config.service';

let dir: string;
const write = (name: string, text: string) => {
  fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
  fs.writeFileSync(path.join(dir, name), text);
};
const config = (options: unknown = {}, env: NodeJS.ProcessEnv = {}) =>
  new ConfigService(dir, { options, env }).data.typeOrmConfig as {
    url?: string;
  };
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dbstats-config-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  jest.restoreAllMocks();
});
it('uses addon then environment then recorder, preserving encoded credentials and transport text', () => {
  write('configuration.yaml', 'recorder:\n  db_url: postgres://recorder/db');
  const uri =
    'mysql://user:p%40ss@localhost/db?charset=utf8mb4;ssl=true&unix_socket=/tmp/test.sock';
  expect(
    config(
      { connectionString: uri },
      { DB_CONNECT_STRING: 'postgres://env/db' },
    ).url,
  ).toBe(uri);
  expect(
    config({ connectionString: '' }, { DB_CONNECT_STRING: 'postgres://env/db' })
      .url,
  ).toBe('postgresql://env/db');
  expect(config().url).toBe('postgresql://recorder/db');
});
it.each([42, 'CANARY_BAD_URI'])(
  'rejects malformed explicit options safely: %s',
  (connectionString) => {
    expect(() => config({ connectionString })).toThrow(/CONFIG_URL_INVALID/);
  },
);
it('resolves arbitrary quoted include at original key and inherits individual secrets', () => {
  write(
    'configuration.yaml',
    'recorder: !include "nested/arbitrary file.yaml" # comment',
  );
  write('nested/arbitrary file.yaml', 'db_url: !secret database');
  write('nested/secrets.yaml', 'unrelated: local');
  write('secrets.yaml', 'database: postgres://parent/db');
  expect(config().url).toBe('postgresql://parent/db');
  write('nested/secrets.yaml', '');
  expect(config().url).toBe('postgresql://parent/db');
  write('nested/secrets.yaml', 'database: postgres://nearest/db');
  expect(config().url).toBe('postgresql://nearest/db');
});
it.each(['include_dir_named', 'include_dir_merge_named'])(
  'loads packages using %s',
  (tag) => {
    write('configuration.yaml', `homeassistant:\n  packages: !${tag} packages`);
    write(
      'packages/one.yaml',
      tag === 'include_dir_named'
        ? 'recorder:\n  db_url: postgres://package/db'
        : 'database:\n  recorder:\n    db_url: postgres://package/db',
    );
    expect(config().url).toBe('postgresql://package/db');
  },
);
it.each([
  'recorder: !include missing.yaml',
  'recorder: !include cycle.yaml',
  'recorder:\n  db_url: !secret absent',
  'recorder:\n  db_url: !input unsupported',
])('fails unresolved recorder without SQLite fallback', (yaml) => {
  write('configuration.yaml', yaml);
  write('cycle.yaml', '!include cycle.yaml');
  write('home-assistant_v2.db', 'old database');
  expect(() => config()).toThrow(/CONFIG_/);
});
it('never emits secret replacements, source snippets or unknown tag arguments', () => {
  const logs = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
  const warnings = jest
    .spyOn(Logger.prototype, 'warn')
    .mockImplementation(() => {});
  const canary = 'CANARY_PASSWORD';
  write('secrets.yaml', `database: mysql://user:${canary}@localhost/db`);
  for (const yaml of [
    'recorder:\n  db_url: !secret database\n  other: !secret absent',
    `recorder: [mysql://user:${canary}@localhost/db`,
    `recorder: !unknown ${canary}`,
  ]) {
    write('configuration.yaml', yaml);
    let error: Error;
    try {
      config();
    } catch (caught) {
      error = caught;
    }
    // Unused recorder fields are deliberately not evaluated.
    expect(
      JSON.stringify([logs.mock.calls, warnings.mock.calls, error?.message]),
    ).not.toContain(canary);
  }
});
it('rejects duplicate recorder URLs across packages', () => {
  write(
    'configuration.yaml',
    'recorder:\n  db_url: postgres://first/db\nhomeassistant:\n  packages:\n    another:\n      recorder:\n        db_url: postgres://second/db',
  );
  expect(() => config()).toThrow(/CONFIG_RECORDER_DUPLICATE/);
});
it('permits repeated includes outside an active cycle', () => {
  write(
    'configuration.yaml',
    'homeassistant:\n  packages:\n    first: !include shared.yaml\n    second: !include shared.yaml\nrecorder:\n  db_url: postgres://main/db',
  );
  write('shared.yaml', 'sensor: []');
  expect(config().url).toBe('postgresql://main/db');
});
it.each(['include_dir_list', 'include_dir_merge_list'])(
  'rejects list-shaped recorder configuration from %s',
  (tag) => {
    write('configuration.yaml', `recorder: !${tag} parts`);
    write('parts/one.yaml', '- db_url: postgres://list/db');
    expect(() => config()).toThrow(/CONFIG_RECORDER_INVALID/);
  },
);
it('redacts malformed secrets files and missing keys after another secret resolves', () => {
  const logs = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
  const warn = jest
    .spyOn(Logger.prototype, 'warn')
    .mockImplementation(() => {});
  write('configuration.yaml', 'recorder:\n  db_url: !secret database');
  write('secrets.yaml', 'database: [mysql://user:CANARY_SECRET@localhost/db');
  let message = '';
  try {
    config();
  } catch (error) {
    message = error.message;
  }
  expect(message).toMatch(/CONFIG_YAML_INVALID.*line=.*column=/);
  expect(
    JSON.stringify([message, logs.mock.calls, warn.mock.calls]),
  ).not.toContain('CANARY_SECRET');
});
