export const waterReview = {
  title: "现场核查",
  description: "点击公园或道路，定位查看新增候选和观测缺口。",
  search: "查找公园或道路",
  submitSearch: "查找",
  clearSelection: "清除核查对象高亮",
  loading: "正在核查地图对象…",
  failed: "无法读取核查结果。",
  retry: "重试",
  noDatasets: "请在工作区文件中上传覆盖该成果的公园或道路 GeoJSON。",
  openWorkspace: "打开工作区",
  empty: "当前筛选范围没有可列出的对象。",
  locate: (name: string) => `定位到${name}`,
  park: "公园",
  road: "道路",
  candidate: "新增候选",
  stable: "九组阈值一致",
  missing: "无共同有效观测",
  disagreement: "指数分歧",
  covered: "成果覆盖",
  evidence: "先复核候选区域，实际设施受影响和道路通行情况需现场确认。",
  roadEstimate: "道路为重合的中心线估计长度。",
  area: (squareMeters: number) =>
    squareMeters >= 10_000
      ? `${(squareMeters / 1e6).toFixed(3)} km²`
      : `${Math.round(squareMeters).toLocaleString("zh-CN")} m²`,
  length: (meters: number) =>
    meters >= 1000
      ? `${(meters / 1000).toFixed(2)} km`
      : `${Math.round(meters).toLocaleString("zh-CN")} m`,
};
