export const objectReview = {
  title: "对象核查",
  open: "核查对象",
  close: "关闭对象核查",
  submit: "开始核查",
  dataset: "选择工作区 GeoJSON",
  search: "对象名称（可选）",
  loadingDatasets: "正在读取工作区文件…",
  loading: "正在核查地图对象…",
  noDatasets: "请上传覆盖成果范围的 GeoJSON。线和面要素需包含名称。",
  openWorkspace: "打开工作区上传",
  empty: "所选数据和筛选条件下没有可列出的对象。",
  locate: (name: string) => `定位到${name}`,
  covered: "成果覆盖 / 对象范围",
  evidence: "按像元中心统计面积，按矢量线段估算长度。根据重合证据安排复核。",
  area: (squareMeters: number) =>
    squareMeters >= 10_000
      ? `${(squareMeters / 1e6).toFixed(3)} km²`
      : `${Math.round(squareMeters).toLocaleString("zh-CN")} m²`,
  line: (meters: number) =>
    meters >= 1000
      ? `${(meters / 1000).toFixed(2)} km`
      : `${Math.round(meters).toLocaleString("zh-CN")} m`,
};
