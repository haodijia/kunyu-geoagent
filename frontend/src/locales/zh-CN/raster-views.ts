export const rasterCopy = {
  description: (bands: number, views: number) =>
    `${bands} 个波段 · ${views} 个视图`,
  reuse: "各视图共享原始 TIFF；切换展示、点查和统计复用本次计算",
  groups: "视图主题",
  select: "选择视图",
  switchView: "切换栅格视图",
  bands: "波段",
  source: "下载原始 TIFF",
  validPixels: "有数值像元",
  gridArea: "网格面积",
  count: "像元数",
  minimum: "最小值",
  maximum: "最大值",
  mean: "均值",
} as const;
