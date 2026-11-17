/** Share in-flight work and retain successful snapshots for five minutes. */
export class SnapshotCache<T> {
  private entries = new Map<string, { expires: number; work: Promise<T> }>();
  constructor(private readonly ttlMs = 300000) {}

  get(key: string, loader: () => Promise<T>): Promise<T> {
    const cached = this.entries.get(key);
    if (cached && cached.expires > Date.now()) {
      return cached.work;
    }
    if (this.entries.size >= 32) {
      this.entries.delete(this.entries.keys().next().value);
    }
    const entry = { expires: Infinity, work: undefined as Promise<T> };
    entry.work = Promise.resolve()
      .then(loader)
      .then(
        (value) => {
          entry.expires = Date.now() + this.ttlMs;
          return value;
        },
        (error) => {
          if (this.entries.get(key) === entry) {
            this.entries.delete(key);
          }
          throw error;
        },
      );
    this.entries.set(key, entry);
    return entry.work;
  }
}
