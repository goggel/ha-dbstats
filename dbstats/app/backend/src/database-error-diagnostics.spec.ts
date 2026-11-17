import { databaseErrorDiagnostics } from './database-error-diagnostics';

test('unwraps TypeORM driver errors and ignores unrelated properties', () => {
  expect(
    databaseErrorDiagnostics({
      driverError: {
        code: 'ER_INVALID_JSON_CHARSET',
        errno: 3144,
        sqlState: '22032',
        message: 'CANARY',
      },
      query: 'CANARY',
    }),
  ).toBe('; code=ER_INVALID_JSON_CHARSET errno=3144 sqlState=22032');
  for (const error of [
    null,
    undefined,
    'CANARY',
    { code: 'CANARY', errno: Infinity, sqlState: 'CANARY' },
    { errno: -1 },
    { errno: 65536 },
  ]) {
    expect(databaseErrorDiagnostics(error)).toBe('');
  }
});
