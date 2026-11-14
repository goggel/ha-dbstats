import { domainQuery } from './domain-query';

describe('domain query bounds', () => {
  it.each([0, -1, 1.5, Infinity, NaN])('rejects invalid limit %s', (limit) => {
    expect(() => domainQuery('sqlite', limit)).toThrow();
  });
  it('rejects unsupported engines', () => {
    expect(() => domainQuery('unknown', 10)).toThrow();
  });
});
