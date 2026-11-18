export const objectReview = {
  title: "对象核查",
  overlay: "矢量图层",
  vectorCount: (count: number) => `${count.toLocaleString("zh-CN")} 个对象`,
  guidance: "点击地图上的点、道路或设施查看该对象的分析。",
  choose: "此处有多个对象，选择一个进行分析。",
  unnamed: "未命名",
  loadingVectors: "正在加载矢量…",
  loadingObject: "正在分析选中对象…",
  partial: "矢量数据仅覆盖成果的部分范围。",
  none: "矢量数据目录尚未覆盖该成果区域。",
  empty: "该范围内没有矢量对象。",
  outside: "选中对象没有可统计的栅格像元。",
  recordField: "记录现场",
  observedAt: "现场观察时间",
  fieldNote: "现场所见",
  fieldPlaceholder: "例如，南门积水，步道西侧可通行。",
  addPhotos: "添加现场照片",
  photoLimit: "可选 8 张 JPG、PNG、WebP 或 GIF，单张最大 16 MB，总计 32 MB。",
  save: "保存现场记录",
  saving: "正在保存…",
  cancel: "取消",
  observationCount: (count: number) => `现场记录 ${count}`,
  excluded: "该线状对象是桥梁、隧道或高架，当前成果的地面重合口径不适用。",
  covered: "栅格覆盖 / 已收录范围",
  evidence: {
    point: "读取对象位置的原始像元分类。",
    line: "按矢量线段估算与候选像元重合的长度。",
    area: "按像元中心统计与对象范围重合的面积。",
  },
  kind: { point: "点", line: "线", area: "面" },
  area: (squareMeters: number) =>
    squareMeters >= 10_000
      ? `${(squareMeters / 1e6).toFixed(3)} km²`
      : `${Math.round(squareMeters).toLocaleString("zh-CN")} m²`,
  line: (meters: number) =>
    meters >= 1000
      ? `${(meters / 1000).toFixed(2)} km`
      : `${Math.round(meters).toLocaleString("zh-CN")} m`,
  point: (count: number) => `${count.toLocaleString("zh-CN")} 点`,
};
