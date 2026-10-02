# mu / deepseek-harness 对齐核查

## 参考实现

- mu：`desktop/packages/desktop/src/renderer/styles/themes/mu-color-scheme.css`、`mu-shell.css`、`mu-arco.css`、`pages/conversation/Messages/messages.css`、`components/chat/SendBox/sendbox.css`。
- deepseek-harness：`packages/client/ui-trajectory/src/client/` 的时间线、记录表格、请求头解释、消息分类、工具生命周期和详情页；`packages/core/agent-loop/src/` 的上下文与请求边界。

## 修正

- 对话与输入框共用 mu 的容器宽度规则，统一消息字号、工具行、圆角、模型胶囊和浅色／深色状态。
- 保留侧栏顶部原有 logo、产品名、搜索与通知图标；缩紧导航与项目列表，添加 mu 的紫色选中条。点击顶部搜索图标在同一行展开输入框，过滤当前项目／会话列表，支持 Cmd/Ctrl+K 与 Esc 退出。侧栏不再单列搜索及已归档会话入口，归档会话在设置中查看。
- 轨迹使用独立的 harness 语义颜色：系统灰、用户蓝、上下文绿、助手紫、工具橙。初始系统提示词置顶，相同请求头不重复显示；仅有工具调用的助手步骤显示连接点。
- 工具输入与结果在同一行分栏，详情分为概述、参数、结果、Schema、计时。系统详情分为系统提示词、工具、模型和变更；消息详情保留预览、原始事件与来源。
- 启用轮次与调用折叠。详情可调整宽度，输入框与实际详情宽度联动，窄窗口采用覆盖详情面板。
- Agent 使用单一 `kunyu` 包，运行循环位于 `kunyu.agent.runtime`，业务工具按功能位于 `kunyu.agent.tools`，通过真实插件服务装配 SessionAgent → Scheduler → 执行子作用域 Runner → 事件存储／确定性 reducer 架构；插件贡献的工具、提示词与可选 Skill Provider 按作用域继承和释放。源码对应及尚未实现的能力见[后端 Agent 结构](develop/后端Agent结构.md)。系统指令单独保存于 `backend/src/kunyu/agent/prompts/system.md`，工作区、地图和持久注入上下文的来源写入请求快照。记忆只通过 `memory_read`、`memory_write` 进入历史，不再把最新记忆前置到整段对话。请求头在助手开始事件之前提交，历史仅包含当前轮次及以前的消息。

## 验证

### 会话输入与 `/` 命令（2026-10-02）

- 输入框与消息区域共用最大 800px 的居中宽度，窄列继续铺满可用空间；输入框从一行增长，最高 120px。地图坐标收至上下文提示，工具栏保留简短地图标签。
- 模型与推理强度合并至同一个面板：按连接分组搜索模型、按供应商模型目录的真实档位显示滑杆、恢复供应商声明的默认档位。未声明默认值时显示“默认”，不把滑杆自动放在某个猜测档位。
- DeepSeek 按官方 `/models` 的 `effort.supported_levels` / `default_level` 保存档位和默认值。当前官方原生档位为 `low / high / max`，默认 `high`；harness 的关闭标识 `off` 单独显示，适配器发送 `thinking.type=disabled`。其他显式档位发送 `thinking.type=enabled` 和 `reasoning_effort`。未显式选择则交给供应商默认。兼容别名不作为独立档位。来源：[模型列表](https://api-docs.deepseek.com/zh-cn/api/list-models/)、[思考模式](https://api-docs.deepseek.com/guides/thinking_mode/)。已有连接需刷新模型目录以取得这些元数据。
- DeepSeek 流式 `reasoning_content` 独立持久化、计入输出预算；携带工具的后续请求回传历史助手思考内容，包括未调用工具的步骤。连接能力探测显式关闭思考，避免 128-token 探测被思考耗尽。
- 命令参考 `interaction/commands` 的作用域注册、声明式描述和 `command/run`、`command/done` 执行日志；前端从会话接口读取已装配命令，并合并客户端 `/model` 和真实可供用户调用的 Skill。支持过滤、上下键、Enter、Tab 补全、Escape；失败保留草稿，网络重试复用请求身份。命令结果保存在会话和轨迹中，不混入模型历史。
- 首批已实现 `/plan [off|计划需求]`、`/permission [read-only|workspace-write]`、`/compact`、`/feedback <内容>`、`/export`。计划模式通过提示词和工具策略生效；权限切换也在确认批准时重新校验。当前执行器只有只读工具和需确认的本地写入，不声明不存在的 shell 沙箱权限。
- `/compact` 使用最近轮次的模型配置生成摘要，仅在 Agent 空闲且日志边界未变化时提交；后续模型上下文使用摘要，原始日志与可见消息保留。`/feedback` 写入当前会话日志，`/export` 下载完整 JSONL ZIP。
- harness 的 `/goal` 依赖目标状态、预算和自主续跑服务，Kunyu 当前尚未装配这些能力，因此本批不注册该命令。计划退出使用 `/plan off`；尚未实现 harness 的计划审阅交互和模型退出工具。
- 本次验证：前端类型检查与生产构建、后端 Ruff 与编译检查通过；临时数据库与模拟供应商验证命令目录（包含 Skill）、幂等调用、真实 Runner 推理与工具历史回传、计划／权限拦截、摘要续接和 ZIP 导出。未新增测试文件，未调用真实模型供应商。新增迁移仅保存供应商声明的默认推理档位。

### 既有对齐验证

- `npm --prefix frontend run build`：通过类型检查与生产构建；已有的大包体积提示仍存在。
- `uv run --project backend python -m compileall -q backend/src`：通过。
- 只读现有会话快照检查浅色、深色、工具 Schema、侧栏搜索、轮次／调用折叠、窄窗口布局：无页面运行错误，窄窗口横向溢出为 0。
- 临时数据库副本中以本地模型适配器驱动真实 Runner：使用当前两个记忆工具完成读取、确认、原子写入和继续回复；下一轮保留原工具历史与注入内容，记忆未自动前置。未调用真实模型供应商，未修改用户数据库。
- 未新增测试文件，未新增数据库迁移。

新来源信息从新运行开始记录，既有事件保持原始事实。附图使用现有会话与临时副本运行生成的数据：

- [对话深色预览](ui-mockups/mu-aligned-conversation-dark.png)
- [轨迹深色预览](ui-mockups/harness-aligned-trajectory-dark.png)
