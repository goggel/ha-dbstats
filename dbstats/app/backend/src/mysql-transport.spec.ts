import { ConfigService } from './config.service';
import { DataSource } from 'typeorm';

const map = ConfigService.connectionStringToDatabaseOptions;
describe('MySQL transport', () => {
  it('preserves encoded credentials and maps default charset to the driver', () => {
    const options = map('mysql+pymysql://user%40x:p%3Aa%3Bss@localhost/db');
    const ds = new DataSource(options as never);
    const driver = ds.driver as unknown as {
      createConnectionOptions(a: unknown, b: unknown): unknown;
    };
    expect(driver.createConnectionOptions(options, options)).toMatchObject({
      user: 'user@x',
      password: 'p:a;ss',
      charset: 'utf8mb4',
    });
    expect(options).not.toHaveProperty('extra');
  });
  it.each([
    'ssl=true',
    'ssl_mode=REQUIRED',
    'ssl_mode=VERIFY_CA',
    'ssl_mode=VERIFY_IDENTITY',
  ])('requires verified TLS for %s', (query) => {
    expect(
      map(`mysql://u:p@localhost/db?charset=utf8mb4;${query}`),
    ).toMatchObject({
      charset: 'utf8mb4',
      ssl: { rejectUnauthorized: true, verifyIdentity: true },
    });
  });
  it.each([
    'ssl=false',
    'ssl_mode=PREFERRED',
    'ssl_verify_cert=false',
    'rejectUnauthorized=false',
    'unknown=true',
    'ssl=true&ssl=true',
    'ssl_ca=/missing/ca',
    'unix_socket=/missing/socket',
    'charset=',
    'ssl=%7B%7D',
  ])('rejects unsupported options safely: %s', (query) => {
    expect(() => map(`mysql://CANARY:CANARY@localhost/db?${query}`)).toThrow(
      'CONFIG_MYSQL_TRANSPORT_INVALID',
    );
  });
});
