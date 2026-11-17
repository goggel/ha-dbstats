import {sizeFormatter} from './sizeFormat';

it.each<[number, string]>([
    [4 / 1024 / 1024, '4 B'],
    [0.04, '40.96 KiB'],
    [1, '1 MiB'],
    [1024, '1 GiB'],
    [0, '0 B'],
])('formats %s MiB in a readable unit: %s', (value, expected) => {
    expect(sizeFormatter(value)(value)).toBe(expected);
});
it('uses the same unit for bar labels, tooltip values and axis ticks, preserving fractions', () => {
    const format = sizeFormatter(0.04);
    expect(format(0)).toBe('0 KiB');
    expect(format(0.005)).toBe('5.12 KiB');
    expect(format(0.03)).toBe('30.72 KiB');
});
