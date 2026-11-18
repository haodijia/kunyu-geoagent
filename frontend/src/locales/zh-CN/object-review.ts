export const objectReview = {
  title: "对象核查",
  open: "查看核查结果",
  close: "收起核查结果",
  overlay: "核查对象图层",
  candidateObjects: "有候选重合",
  otherObjects: "其他核查对象",
  partial: "矢量数据仅覆盖成果的部分范围。",
  empty: "当前覆盖和筛选条件下没有可列出的对象。",
  locate: (name: string) => `定位到${name}`,
  covered: "成果覆盖 / 已收录范围",
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
