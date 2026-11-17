// The existing size endpoints return MiB. Choose one readable unit for the chart.
export function sizeFormatter(maxMiB: number): (valueMiB: number) => string {
    const units = ['B', 'KiB', 'MiB', 'GiB'];
    const maxBytes = maxMiB * 1024 * 1024;
    const index = maxBytes < 1 ? 0 : Math.min(3, Math.floor(Math.log2(maxBytes) / 10));
    const divisor = 1024 ** index;
    return valueMiB => `${(valueMiB * 1024 * 1024 / divisor).toLocaleString('en-US', {maximumFractionDigits: index === 0 ? 0 : 2})} ${units[index]}`;
}
