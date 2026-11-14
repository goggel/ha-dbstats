import type { Logger } from '@nestjs/common';
import { TypeOrmLoggerContainer } from './typeOrmLogger';

test('query diagnostics never include driver, SQL, URI or parameter canaries', () => {
  const output: unknown[] = [];
  const logger = {
    log: (...args: unknown[]) => output.push(args),
    warn: (...args: unknown[]) => output.push(args),
  } as unknown as Logger;
  const diagnostics = new TypeOrmLoggerContainer(logger, 'all');
  const canary = 'SELECT CANARY_SQL mysql://CANARY_URI';
  diagnostics.logQuery(canary, [canary]);
  diagnostics.logQueryError(canary, canary, [canary]);
  diagnostics.logQuerySlow(10, canary, [canary]);
  expect(output.length).toBe(3);
  expect(JSON.stringify(output)).not.toContain('CANARY');
});
