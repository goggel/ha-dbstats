import * as fs from 'fs';
import * as path from 'path';
import * as YAML from 'js-yaml';

/** Never propagate parser messages: reasons and snippets may contain credentials. */
export class ConfigurationError extends Error {
  constructor(
    code: string,
    file?: string,
    mark?: { line: number; column: number },
  ) {
    super(
      `${code}${file ? ` file=${JSON.stringify(file)}` : ''}${
        mark ? ` line=${mark.line + 1} column=${mark.column + 1}` : ''
      }`,
    );
    this.name = 'ConfigurationError';
  }
}
class Tag {
  constructor(
    readonly kind: string,
    readonly value: string,
    readonly file: string,
    readonly stack: string[],
  ) {}
}
const mapping = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Tag);

/** Recorder-focused subset of annotatedyaml 1.0.2. Unrelated tags remain unevaluated. */
export class HaYaml {
  constructor(private readonly root: string) {}

  private read(file: string, stack: string[] = []): unknown {
    try {
      const tags = [
        'include',
        'include_dir_list',
        'include_dir_merge_list',
        'include_dir_named',
        'include_dir_merge_named',
        'secret',
        'env_var',
        'input',
      ];
      const schema = YAML.DEFAULT_SCHEMA.extend(
        tags.map(
          (kind) =>
            new YAML.Type(`!${kind}`, {
              kind: 'scalar',
              construct: (value: string) => new Tag(kind, value, file, stack),
            }),
        ),
      );
      return YAML.load(fs.readFileSync(file, 'utf8'), { schema }) ?? {};
    } catch (error) {
      throw new ConfigurationError('CONFIG_YAML_INVALID', file, error?.mark);
    }
  }

  private files(dir: string): string[] {
    if (!fs.existsSync(dir)) {
      return [];
    }
    const entries = fs
      .readdirSync(dir)
      .filter((n) => !n.startsWith('.'))
      .sort();
    return entries.flatMap((n) => {
      const file = path.join(dir, n);
      return fs.statSync(file).isDirectory()
        ? this.files(file)
        : n.endsWith('.yaml') && n !== 'secrets.yaml'
        ? [file]
        : [];
    });
  }

  private resolve(value: unknown, stack: string[]): unknown {
    if (!(value instanceof Tag)) {
      return value;
    }
    const { kind, file } = value;
    stack = value.stack;
    if (!value.value) {
      throw new ConfigurationError('CONFIG_TAG_ARGUMENT', file);
    }
    if (kind === 'secret') {
      let dir = path.dirname(file);
      const root = path.resolve(this.root);
      while (dir === root || dir.startsWith(root + path.sep)) {
        const secretFile = path.join(dir, 'secrets.yaml');
        if (fs.existsSync(secretFile)) {
          const secrets = this.read(secretFile);
          if (!mapping(secrets)) {
            throw new ConfigurationError('CONFIG_SECRETS_INVALID', secretFile);
          }
          if (Object.prototype.hasOwnProperty.call(secrets, value.value)) {
            return secrets[value.value];
          }
        }
        dir = path.dirname(dir);
      }
      throw new ConfigurationError('CONFIG_SECRET_MISSING', file);
    }
    if (kind === 'env_var' || kind === 'input') {
      throw new ConfigurationError('CONFIG_TAG_UNSUPPORTED', file);
    }
    const target = path.resolve(path.dirname(file), value.value);
    if (kind === 'include') {
      return this.load(target, stack);
    }
    const values = this.files(target).map(
      (f) => [path.parse(f).name, this.load(f, stack)] as const,
    );
    if (kind === 'include_dir_list') {
      return values.map(([, v]) => v);
    }
    if (kind === 'include_dir_merge_list') {
      return values.flatMap(([, v]) => (Array.isArray(v) ? v : []));
    }
    const result = Object.create(null) as Record<string, unknown>;
    for (const [name, v] of values) {
      if (kind === 'include_dir_named') {
        result[name] = v;
      } else if (mapping(v)) {
        Object.assign(result, v);
      }
    }
    return result;
  }

  private load(file: string, stack: string[]): unknown {
    const canonical = fs.existsSync(file) ? fs.realpathSync(file) : file;
    if (stack.includes(canonical)) {
      throw new ConfigurationError('CONFIG_INCLUDE_CYCLE', file);
    }
    return this.materialize(this.read(file, [...stack, canonical]), [
      ...stack,
      canonical,
    ]);
  }

  private materialize(value: unknown, stack: string[]): unknown {
    // Resolve include structure, leaving unrelated branches lazy until recorder selection.
    if (value instanceof Tag) {
      return this.resolve(value, stack);
    }
    return value;
  }

  recorder(): unknown {
    const file = path.resolve(this.root, 'configuration.yaml');
    const config = this.load(file, []);
    if (!mapping(config)) {
      throw new ConfigurationError('CONFIG_ROOT_INVALID', file);
    }
    const candidates: unknown[] = [];
    const collect = (v: unknown) => {
      v = this.resolve(v, [file]);
      if (!mapping(v)) {
        throw new ConfigurationError('CONFIG_PACKAGE_INVALID', file);
      }
      if (Object.prototype.hasOwnProperty.call(v, 'recorder')) {
        candidates.push(this.resolve(v.recorder, [file]));
      }
    };
    collect(config);
    if (
      mapping(config.homeassistant) &&
      Object.prototype.hasOwnProperty.call(config.homeassistant, 'packages')
    ) {
      const packages = this.resolve(config.homeassistant.packages, [file]);
      if (!mapping(packages)) {
        throw new ConfigurationError('CONFIG_PACKAGES_INVALID', file);
      }
      Object.values(packages).forEach(collect);
    }
    // Retain the historical fixture's recorder nested beneath an arbitrary include key.
    // Normal HA recorder/package positions always take precedence over this fallback.
    if (!candidates.length) {
      const seen = new Set<unknown>();
      const legacy = (node: unknown) => {
        node = this.resolve(node, [file]);
        if (!mapping(node) || seen.has(node)) {
          return;
        }
        seen.add(node);
        if (Object.prototype.hasOwnProperty.call(node, 'recorder')) {
          collect(node);
          return;
        }
        Object.values(node).forEach(legacy);
      };
      Object.values(config).forEach(legacy);
    }
    let url: unknown;
    for (const recorder of candidates) {
      if (recorder == null) {
        continue;
      }
      if (!mapping(recorder)) {
        throw new ConfigurationError('CONFIG_RECORDER_INVALID', file);
      }
      if (Object.prototype.hasOwnProperty.call(recorder, 'db_url')) {
        if (url !== undefined) {
          throw new ConfigurationError('CONFIG_RECORDER_DUPLICATE', file);
        }
        url = this.resolve(recorder.db_url, [file]);
        if (typeof url !== 'string' || !url.trim()) {
          throw new ConfigurationError('CONFIG_URL_INVALID', file);
        }
      }
    }
    return url;
  }
}
