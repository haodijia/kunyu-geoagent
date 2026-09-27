// Labels from DeepSeek Harness, MIT.
const labels = {
  'toolbar.aria': '轨迹工具栏',
  'toolbar.duration': '时长',
  'toolbar.useActualDuration': '使用实际时长',
  'toolbar.useEqualWidth': '使用等宽操作',
  'toolbar.actualTime': '实际时间',
  'toolbar.turns': '轮次',
  'toolbar.expandTurns': '展开所有轮次',
  'toolbar.collapseTurns': '收起所有轮次',
  'toolbar.calls': '调用',
  'toolbar.expandCalls': '展开所有调用',
  'toolbar.collapseCalls': '收起所有调用',
  'toolbar.search': '搜索轨迹',
  'toolbar.searchPlaceholder': '搜索',
  'kind.system': '系统',
  'kind.user': '用户',
  'kind.context': '上下文',
  'kind.compacted': '已压缩',
  'kind.assistant': '助手',
  'kind.tool': '工具',
  'kind.subtool': '子工具',
  'column.input': '输入',
  'column.model': '模型',
  'column.tools': '工具',
  'unit.milliseconds': '{value} 毫秒',
  'history.loadingEarlier': '正在加载更早的历史…',
  'history.loadingEarlierAria': '正在加载更早的历史…',
  'history.loadEarlier': '加载更早的历史',
  'history.clickToLoadEarlier': '点击加载更早的历史',
  'timeline.aria': '轨迹时间线',
  'timeline.overviewAria': '时间线概览；水平拖动可聚焦事件',
  'timeline.noTimingData': '无计时数据',
  'timeline.total': '总计 {duration}',
  'timeline.started': '开始于 {time}',
  'timeline.ttftDecoding': '首 token {ttft} · 解码 {decoding}',
} as const;
export type TrajectoryTranslate = (key: keyof typeof labels, values?: Record<string, string | number>) => string;
export const trajectoryTranslate: TrajectoryTranslate = (key, values = {}) => {
  let text: string = labels[key];
  for (const [name, value] of Object.entries(values)) text = text.replaceAll(`{${name}}`, String(value));
  return text;
};
