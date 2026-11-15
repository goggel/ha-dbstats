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

test('driver identifiers survive while arbitrary fields and malformed codes stay private', () => {
  const output: unknown[] = [];
  const logger = {
    warn: (...args: unknown[]) => output.push(args),
  } as unknown as Logger;
  const diagnostics = new TypeOrmLoggerContainer(logger, 'all');
  const error = Object.assign(new Error('CANARY_MESSAGE'), {
    code: 'ER_WRONG_FIELD_WITH_GROUP',
    errno: 1055,
    sqlState: '42000',
    sql: 'CANARY_SQL',
    parameters: ['CANARY_PARAMETER'],
    credentials: 'CANARY_SECRET',
  });
  diagnostics.logQueryError(error, 'CANARY_QUERY', ['CANARY_PARAMETER']);
  expect(JSON.stringify(output)).toContain(
    'code=ER_WRONG_FIELD_WITH_GROUP errno=1055 sqlState=42000',
  );
  expect(JSON.stringify(output)).not.toContain('CANARY');
  diagnostics.logQueryError(
    Object.assign(new Error('CANARY'), {
      code: 'CANARY_CODE',
      errno: 'CANARY',
      sqlState: '42000\nCANARY',
    }),
    'CANARY',
  );
  expect(output[1]).toEqual(['Database query failed']);
});
