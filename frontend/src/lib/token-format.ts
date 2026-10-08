// Adapted from Mu (Apache-2.0); see licenses/AionUi-LICENSE.txt.

const numberFormat = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 1 });
const percentFormat = new Intl.NumberFormat("zh-CN", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function formatTokenCount(count: number, hideZeroDecimals = false): string {
  function scaled(value: number, suffix: string): string {
    return `${numberFormat.format(hideZeroDecimals && value.toFixed(1).endsWith(".0") ? Math.floor(value) : value)}${suffix}`;
  }
  if (count >= 1_000_000) return scaled(count / 1_000_000, "M");
  if (count >= 1_000) return scaled(count / 1_000, "K");
  return numberFormat.format(count);
}

export function formatUsagePercentage(ratio: number): string {
  return percentFormat.format(ratio);
}
