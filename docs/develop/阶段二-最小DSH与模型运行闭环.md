# 阶段二：最小 DSH 与模型运行闭环

> 状态：待开发
>
> 基线日期：2026-09-27。阶段一已完成；本文以当前源码和[开发架构设计](../开发架构设计.md)为基线。
>
> 目标：在现有桌面会话中接入真实模型，完成用户消息、Assistant 流式回复、本地工具、精确确认、取消与重启恢复的闭环。阶段二不执行 OGE 作业。

> 模型连接设置页开发项：[P2-05 模型连接设置页](#p2-05-模型连接设置页-featsettings-manage-model-connections-in-existing-shell)。当前前端尚未实现该页面，现有设置路由只有归档页。

## 1. 开发方式

1. 按本文依赖顺序逐项开发，每个 commit 只交付对应结果。
2. 开始新的开发项前提交已有修改；完成本项检查后自动 commit，停止并等待用户审核，不自行进入下一项。
3. 后端使用 uv；不新增数据库迁移、软件版本升级或旧契约兼容分支。前后端契约变更同步落地。
4. 不写假模型回复、假工具结果，不在失败时替换模型、协议、凭据存储或事件源。
5. 默认不新增测试文件。执行类型检查、构建、隔离数据目录下的手工接口检查和桌面验收；用户明确要求时再编写测试。
6. 开发前按第 2.1 节核对参考源码：模型连接与模型名称发现参考 maka-agent，Agent 运行架构参考 deepseek-harness，界面参考 mu、deepseek-harness 与 v3 原型。界面复用现有 shadcn/ui、Tailwind 和统一主题；不引入 Arco、不重建 Shell、不照搬无关业务。
7. 未完成或无法验证的能力明确记录，不把通过构建等同于真实模型、凭据库或跨进程恢复验收通过。

## 2. 从阶段一接续

| 已有能力 | 阶段二处理方式 |
| --- | --- |
| Electron 启停、Ready、健康与诊断 | 复用；增加 Runner 启停和关闭前的运行状态落盘 |
| api → application → domain、persistence | 保持分层，模型/Run/确认继续按职责放置 |
| SQLite WAL 与六张业务表 | 扩充当前 ORM，不引入 Alembic；不在启动时清库 |
| User Message 与事件同事务写入 | 改为 User Message、Run、模型快照与创建事件同事务提交 |
| 会话 sequence 与 after_sequence SSE | 沿用顺序和重连协议，所有新增事件进入同一游标序列 |
| SessionMessagesProvider / SessionEventProvider | 扩展 Assistant、Run、Tool 和确认，不新增第二份订阅 |
| 对话/轨迹/地图共享草稿和 MapContext | 增加模型选择与本次请求快照，不承诺草稿跨重启保存 |
| 设置 Shell、归档页、共享 UI | 新增模型设置分区，保留归档功能 |
| 会话归档与工作空间移除 | 增加未完成 Run 的事务级冲突保护 |

当前 POST messages 仅接受 role=user 和 content，返回 Message（201）；没有模型选择、幂等键、Run 或 Assistant。这些均在本阶段新增，不能按“已有能力”直接依赖。

### 2.1 参考源码与移植边界

| 来源 | 核对位置 | 本项目对齐方式 |
| --- | --- | --- |
| maka-agent | `apps/desktop/src/renderer/settings/provider-add-form.tsx`、`apps/desktop/src/renderer/settings/use-connection-detail.ts`、`apps/desktop/src/main/connection-model-discovery.ts`、`packages/runtime/src/model-fetcher.ts`、`packages/core/src/llm-connections.ts`、`packages/core/src/model-catalog.ts` | 对齐创建连接后自动拉取、保存密钥/端点后重新拉取、手动刷新、凭据/协议/空列表失败提示、目录来源与时间、模型可用性和选择的实际行为。将 Electron IPC/TypeScript 实现改为 FastAPI 应用服务与 Python 适配器；首期对齐已声明的 OpenAI-compatible `/models` 路径。 |
| deepseek-harness | `packages/core/agent-loop/src/agent.ts`、`packages/core/agent-loop/src/tool-calls.ts`、`packages/core/session/src/index.ts`、`packages/core/session/src/surface.ts`、`packages/core/tools/src/index.ts` | 对齐单 Agent 的模型—工具—模型推进、可见历史重建、工具校验/守卫、事件先持久再派生状态、取消保留已交付正文和恢复边界。落到 `dsh` Protocol、显式 Host 装配、SQLite 同事务事件和 Run 投影。 |
| mu | 现有模型设置与选择相关组件、样式 | 只参考界面层级、间距和控件使用；业务状态、接口文案和运行架构以本项目契约为准。 |

对上述**阶段二覆盖的同类功能**，验收标准是输入、状态变化、错误反馈和最终用户效果与参考实现一致；不能只做相似的目录结构或接口名称。源码和文案可以重写，但不能省略参考实现的关键分支。开发时先把源行为列成核对项，再逐项映射到本项目 API、持久层和界面；不一致处必须记录原因并在交付前修正。参考仓库超出本阶段的 Provider 协议、Cordis、多 Agent 等能力仍按第 3 节范围处理。每个后续实现 commit 的正文须列出实际对照的来源路径、源行为、本项目实现位置和验证结果，不能仅写“参考 maka-agent/DSH”。

| 对齐场景 | 必须达到的可观察结果 |
| --- | --- |
| 创建或更新 OpenAI-compatible 连接 | 有可用凭据时自动读取该端点的模型列表；新密钥或端点触发重新发现；用户可主动刷新。发现结果保留精确 ID、来源和时间，刷新失败不冒充成功。 |
| 模型选择与检查 | 可用模型按真实目录展示；已移除或不可用模型有明确状态，不能悄悄换成另一个模型；测试结果明确指出实际测试的模型、成功或失败原因。 |
| 单 Agent 普通回复 | 已受理用户输入只进入一次历史；模型流式回复、完成状态和重启后的内容一致；下一次模型请求能看到已经提交的可见历史。 |
| Tool Call 与确认 | 完整结构化调用经过 Schema 和策略检查；工具结果进入后续模型请求；写入停在精确确认点，拒绝或重复批准不会产生副作用。 |
| 取消与恢复 | 取消终止当前调用并保留已交付的部分正文；重启能从已提交事实恢复同一 Run 的状态，未确认写入不会被自动重放。 |

## 3. 范围

### 3.1 本阶段交付

- 最小 DSH 的 Host、Plugin、Capability、ModelAdapter、Tool、PolicyGate、EventStore、Reducer 和 Runner。
- 多个模型连接、唯一默认连接、系统凭据库存储、连接测试与自动发现模型名称的目录。
- 一个明确的 OpenAI-compatible 协议适配器，支持真实文本流和结构化 Tool Call；Provider 差异使用显式配置处理。
- 输入框选择连接、模型和受支持的推理强度，Run 保存不可变模型与地图上下文快照。
- 持久 Assistant 消息、运行状态、工具调用、确认、错误与中断记录。
- 本地只读 workspace.get_context、memory.search，以及必须人工确认的 workspace.memory.save。
- 取消、等待确认、重启重建、显式恢复、请求幂等与会话内单 Run 约束。
- 真实事件驱动的对话活动与轨迹，复用现有时间线和详情面板。
- GeoSkill 内置包校验、只读目录、版本详情及会话场景选择；依赖 OGE 的正式执行保持阻塞。

### 3.2 本阶段不做

- OGE 鉴权、远程计算、processId、Task 监督器、地图成果或报告 Artifact。
- 原生 Ollama 协议适配、任意 Provider 自动识别、协议探测与自动模型切换。自动发现只读取当前连接明确配置的模型列表接口。
- 通用插件市场、多 Agent、任意脚本执行、向量数据库、复杂上下文压缩或 Case Memory。
- GeoSkill 编辑发布、工作流画布、Workspace 文件系统访问或前端直接连接模型。
- 安装包、签名、自动更新和独立服务器交付。

模型连接若使用本地服务，仍必须显式配置为本阶段已实现的协议；协议不支持时显示错误，不改走另一套请求。

## 4. 本阶段冻结的契约

### 4.1 Run 创建和并发

发送请求先校验会话未归档、空间未移除、模型选择有效、凭据状态可用、MapContext 属于当前空间，然后在一个 SQLite 事务中：

1. 检查本次 Idempotency-Key 与请求正文是否已经受理。
2. 检查同一 Session 没有非终态 Run。
3. 写入 User Message、Run、RunModelSnapshot、MapContext 快照与创建事件。
4. 写入幂等记录，提交后把 run_id 交给进程内调度器。

响应为 202 和 {message, run}；模型失败在 Run 中体现，不回滚已经受理的用户请求。Runner 不能再次追加同一条用户消息。

幂等范围为会话内一次发送：同一 key、相同请求返回同一个 message_id/run_id；同一 key、不同请求返回 409。重复请求先命中幂等记录，再判断并发冲突。客户端必须保留未确认请求的 key 和正文以重试，不能因为超时生成新的 key。

每个 Session 最多一个非终态 Run，通过数据库唯一约束与事务检查保证，不只依赖前端 disabled。不同会话可独立运行，但全局并发数有明确上限。waiting_confirmation 和 interrupted 仍占用运行槽。

### 4.2 消息、事件与流

- Message.role 扩展为 user / assistant；工具请求和结果使用独立 ToolCall 记录，不伪装为用户消息。
- Assistant Message 包含 run_id、content、status，status 区分 streaming、completed、interrupted、failed、cancelled；部分正文不会被当成完整回复。
- Tool Call 的模型关联 ID、校验后参数、返回结果和状态持久保存，恢复后能够重建完整模型上下文。
- AgentEvent 沿用 id、session_id、sequence、event_type、payload、occurred_at，新增可空 run_id。
- 唯一顺序是 (session_id, sequence)；不能改成按 Run 递增，也不能因过滤某类事件留下游标空洞。
- SSE 帧 id 为 sequence 字符串；重连使用 after_sequence。JSON id 是事件主键，不作为订阅游标。
- Assistant 增量按有界批次持久化后再发布，payload 携带 message_id、attempt、offset、text；不要每个字符写一次 SQLite。
- GET messages 返回已持久化正文及状态。首次加载或重连按 message_id/offset 合并增量，已经包含在快照中的文本不重复追加。
- 完成消息与 message.assistant.completed / run.completed 原子落盘；Reducer、Run 状态表和消息记录不能各自提交相互矛盾的终态。
- 流中不保存隐藏推理、API Key、Authorization 头或完整模型原始请求。Provider 的额外推理字段不进入产品消息与审计事件。

事件至少包括 run.created、run.model_selected、run.started、message.assistant.delta、message.assistant.completed、tool.requested、tool.started、tool.completed、tool.failed、confirmation.requested、confirmation.resolved、run.completed、run.failed、run.cancelled、run.interrupted、run.resumed。既有 session.created 和 message.user.appended 保持原语义。

### 4.3 模型连接

ModelConnection 保存稳定 ID、显示名、协议类型、Base URL、认证方式、启用状态、默认标记、配置修订号、已启用模型 ID 集合及模型目录。目录条目保存 Provider 返回的精确 model_id、可选显示名、发现来源、发现时间，以及能被可靠确认的 Tool Call 和 reasoning_effort 能力；未知能力标记为 unknown，不能推断为支持。不向不支持或能力未知的模型发送推理参数。

- 本阶段协议类型仅 openai_compatible；认证方式显式为 api_key 或 none，none 只适用于用户明确配置的免密服务。
- reasoning_effort 为 null 或该模型支持的枚举值；不得把统一的 standard/high 标签不加转换地发给所有服务。
- 参考 maka-agent 的 `discoverConnectionModels → fetchProviderModels`：后端读取当前连接和凭据，向该连接 Base URL 对应的 OpenAI-compatible `GET /models` 发起受限请求，解析 `data[].id`，去空白、去重并限制 ID 长度和条目数。请求、响应格式、认证或空目录异常均返回脱敏错误；不猜测模型名。
- 保存连接且凭据就绪后自动触发一次发现；Base URL 或凭据更新后使旧目录不再可选，并对新配置重新发现。设置页提供“刷新模型列表”；刷新失败不覆盖同一修订号下已有的有效目录，但显示失败和上次成功时间。首次发现失败时连接保持“无可选模型”，不把内置名称当作真实发现结果。
- 用户也可在独立的“手工添加模型”操作中明确填写精确 model_id，来源标为 manual；不会因发现失败自动进入手工模式。手工条目需通过真实连接检查后才可用于 Run。自动发现的条目和手工条目分别标记来源，不伪造能力元数据。
- 模型列表发现与连接测试分开：`GET /models` 成功只能证明目录可读；连接测试必须针对选定 model_id 发起真实受限调用，Tool Call 能力需要真实验证或可靠的 Provider 元数据，不能由名字猜测。
- 对齐 maka-agent 的模型启用选择：目录可以列出多个模型，用户启用的模型才进入会话选择器；默认模型若不在当前可用且已启用的集合中，设置页明确提示并要求重新选择，不把失效 ID 静默替换。目录刷新后保留仍存在的启用选择，移除的 ID 显示为不可用。
- 凭据写入系统凭据库，查询仅返回 configured 和更新时间。API Key 不进入 SQLite、前端持久化、场景包或日志。
- 系统凭据库不可用时阻止需要凭据的连接操作并报告原因，不回退到文件或环境变量存储。
- 默认连接由事务和唯一约束保证最多一个；没有默认连接时要求用户选择，不自行选第一项。
- RunModelSnapshot 冻结连接 ID、协议、Base URL、认证方式、模型 ID、推理参数与配置修订号，不含凭据原文。提交前校验 model_id 属于当前修订号下可用、已启用且已验证的目录；已被刷新移除的模型不能继续作为新 Run 默认值。
- 未完成 Run 引用的连接禁止改配置、替换/删除凭据、禁用或删除；防止中断恢复时悄悄使用不同运行条件。终态 Run 保留快照，不要求原连接永远存在。

### 4.4 工具与确认

| 工具 | 作用 | 级别 | 执行规则 |
| --- | --- | --- | --- |
| workspace.get_context | 当前工作空间、会话、地图引用与可用能力摘要 | L0 | 后端绑定当前 workspace/session，自动执行 |
| memory.search | 读取当前空间已确认的记忆 | L0 | 按关键词与固定条数检索，不跨空间 |
| workspace.memory.save | 保存用户确认的空间偏好或关注事项 | L2 | 每次生成精确确认，批准后落盘 |
| scene.get | 读取内置场景版本的约束和依赖状态 | L0 | 在 GeoSkill 交付项接入后注册 |

本阶段不注册删除数据、修改模型配置、读系统文件、执行 Shell、提交 OGE 等 Tool。模型提供的 scope 标识必须由服务端约束，不能只依赖提示词。

确认对象保存 confirmation_id、run_id、tool_call_id、工具名、校验后的参数、可读摘要、状态与决定时间。批准/拒绝只提交确认标识和决定，不接收替换参数。修改提议必须生成新快照，使旧确认失效。

workspace.memory.save 的写入、ToolCall 完成、确认决定及事件在同一个本地数据库事务内提交；tool_call_id 唯一约束防止重复执行。批准、拒绝、取消竞态使用条件更新，只允许一个结果成功，不能“先执行再保存确认”。

拒绝结束该次 Run 为 cancelled，不自动重新提议相同写入。记忆候选在用户批准前不能被 memory.search 作为事实返回。

### 4.5 中断、恢复与生命周期

本阶段状态为 ready、model_running、tool_running、waiting_confirmation、interrupted、completed、failed、cancelled。waiting_external 属于阶段三，本阶段不得用空任务模拟。

| 重启前状态 | 启动时处理 | 用户操作 |
| --- | --- | --- |
| ready，尚未调度 | 保留受理记录，标明等待显式恢复 | 恢复或取消，不创建第二条消息 |
| model_running | 标记 interrupted，保留已落盘的部分正文 | 恢复时发起新的模型 attempt，旧部分正文不重复拼接 |
| tool_running | 对照持久 ToolCall 和业务事务结果核对 | 已完成直接使用结果；只读调用可重新执行；状态不明的写入禁止盲目重放 |
| waiting_confirmation | 还原原始确认快照，不再次请求模型 | 批准、拒绝或取消 |
| completed / failed / cancelled | 保持终态 | 新请求创建新 Run，不复活终态 |

Runner 由 FastAPI lifespan 管理，不能把一次 request 的 BackgroundTasks 当作可靠任务系统。入队前已提交的 ready Run 必须能在故障后查到；重连 SSE 不启动执行。

关闭时拒绝新 Run，停止模型网络流，等待正在提交的短数据库事务，并把未结束执行标为 interrupted。取消操作落盘后不能再提交晚到的 delta 或工具写入；取消与工具提交采用同一状态检查/事务顺序。

每个 Run 限制模型轮次、工具次数、活动执行时间、输出长度与可获得的用量数据。恢复不重置累计预算；未知 Token 用量保留 null，不编造数字。

有未完成 Run 时，归档 Session、移除其 Workspace、永久删除涉及的归档内容返回 409，前端提示先取消运行。该规则必须在服务端事务内生效，避免 UI 与 API 并发绕过。

### 4.6 API 增量

以下均在 /api/v1 下，并携带 X-Kunyu-Session：

| 方法与路径 | 契约 |
| --- | --- |
| GET/POST /model-connections | 脱敏列表与创建 |
| GET/PATCH/DELETE /model-connections/{id} | 详情、修改、删除及未完成 Run 冲突检查 |
| PUT/DELETE /model-connections/{id}/credential | 写入或清除凭据，绝不返回原文 |
| PUT /model-connections/{id}/default | 原子设置默认连接 |
| POST /model-connections/{id}/test | 真实受限请求，返回检查状态与耗时 |
| POST /model-connections/{id}/discover-models | 用户主动刷新当前连接模型目录；连接保存/凭据就绪后由后端调用同一发现服务 |
| POST /model-connections/{id}/manual-models | 用户显式添加模型 ID；记录 manual 来源，需连接检查通过后才可用于 Run |
| POST /sessions/{id}/messages | Idempotency-Key；正文为 content、model_selection、map_context；返回 202 {message, run} |
| GET /sessions/{id}/messages | 用户与 Assistant 消息，包括持久部分正文和状态 |
| GET /sessions/{id}/runs | 当前/历史 Run 摘要 |
| GET /runs/{id} | 状态、模型快照、预算、暂停原因与确认引用 |
| POST /runs/{id}/cancel | 幂等取消；已完成终态不得改写 |
| POST /runs/{id}/resume | 从允许的暂停点显式恢复；运行中返回冲突 |
| GET /sessions/{id}/confirmations | 还原待确认卡片与已决定状态 |
| POST /confirmations/{id}/approve 或 /reject | 原子决定，不接收新工具参数 |
| GET /scenes、/scenes/{id}/versions/{version} | 只读目录、约束与依赖阻塞原因 |
| PUT /sessions/{id}/scene | 指定 scene_id/version；存在未完成 Run 时拒绝更换 |

SSE 沿用现有路径。阶段二无需新建 /trace REST 接口，继续由统一脱敏事件投影。新增方法及 Idempotency-Key 同步加入 FastAPI CORS 白名单。

发送参数错误返回 422；资源不存在返回 404；归档、忙碌、幂等正文冲突或确认状态冲突返回 409。配置、凭据库和 Provider 错误分别使用稳定错误码与脱敏摘要，前端文案放入 locales。

### 4.7 目录与数据

新增目录按需建立，不预先创建空模块：

```text
backend/src/dsh/                 # 通用契约、Host、Runner、Reducer
backend/src/kunyu/agent/         # 装配、Context、业务 Tool、Policy
backend/src/kunyu/integrations/model/
backend/src/kunyu/secrets/
backend/src/kunyu/scenes/
backend/scenarios/
frontend/src/features/runs/
frontend/src/features/confirmations/
frontend/src/features/geoskills/
frontend/src/features/settings/models/
```

api/application/domain/persistence 中分别增加模型连接、Run、确认、记忆与场景选择模块；不创建与现有 settings.py 冲突的 settings/ 包。前端继续在 features/messages 和 features/events 扩展，不迁到新目录。

新增持久对象至少包括 ModelConnection/ModelCatalogEntry、Run/RunModelSnapshot、ToolCall、Confirmation、WorkspaceMemory、SessionPreference 和发送请求幂等记录。每个对象有明确唯一约束、事务归属与删除策略；Run 快照、事件和消息的归属不能跨 Session。

更改已有表结构时明确使用可重建的开发数据目录；create_all 不负责修改旧列。不要用自动清库代替恢复逻辑，恢复验收必须在同一数据库上重启。

### 4.8 DSH 的职责与装配顺序

借鉴 deepseek-harness 的 `agent-loop`、`session`、`tools` 三个接缝，阶段二只实现单一 `GeoAgent` 的最小闭环：

1. `kunyu.agent.bootstrap` 显式创建 Host，并按 EventStore → ModelAdapter → Context → ToolRegistry → PolicyGate → Runner 的依赖顺序装配；缺能力或重复提供者立即失败，关闭时逆序释放。
2. `dsh.runner` 只消费已受理的 run_id，从不可变快照构建模型请求；一次模型响应中的 Tool Call 先组装完整，再按模型关联 ID 校验、登记、过 PolicyGate 和执行。写工具停在持久确认点，不占用模型网络流等待用户。
3. `dsh.event_store` 只负责会话内有序追加；`dsh.reducer` 从已提交事件得到 RunState。`kunyu` 的 SQLite 适配器把事件、消息、ToolCall 与状态投影放在同一事务，模型可见的已接纳事实必须可由持久记录重建。
4. `dsh.tools` 声明 Schema 和调用契约；`kunyu.agent.tools` 提供白名单业务实现。参数校验和 PolicyGate 位于实际执行之前，模型不能通过提示词、工具名或自报 scope 绕过权限。
5. Runner 的取消信号终止模型流和未执行工具；已持久的部分正文保持 `interrupted`/`cancelled` 状态。重启只从日志与快照重建，恢复由用户显式触发，不重放状态不明的写入。

这里的“插件化”是固定代码装配和能力注入，不做 deepseek-harness 的 Cordis 运行时、动态插件加载、通用消息 surface、并行工具调度或多 Agent。`dsh` 不依赖 FastAPI、SQLAlchemy 或坤舆业务类型；`kunyu` 实现这些 Protocol 并拥有事务、凭据与 API。

## 5. Commit 计划

### P2-01 `feat(dsh): define runtime contracts and host lifecycle`

**结果**：可导入的业务无关 DSH 核心和确定性插件装配。

**范围**：对照 deepseek-harness 的 `packages/core/agent-loop`、`session`、`tools`，定义 AgentRuntime、ModelAdapter、Tool、PolicyGate、EventStore、Context/Memory Protocol；按能力拆文件；Host 检查重复提供者和缺失依赖，按顺序启动、逆序清理。同步 uv_build 的 dsh 包发现，不引入业务 ORM 或 Cordis。

**检查**：uv 环境能导入 dsh 和 kunyu；安装包实际包含两个包；重复能力与缺失依赖明确失败，已启动插件在后续启动失败时释放资源。

### P2-02 `feat(models): persist connections and model catalog`

**结果**：模型连接、目录和默认选择有正式领域与存储契约。

**范围**：对照 maka-agent 的 `llm-connections.ts` 和 `model-catalog.ts`，实现四层模型配置、唯一默认约束、协议/认证方式、已启用模型 ID、模型目录来源与发现时间、能力 unknown 状态和配置修订号；不保存 API Key。新增 GET/POST/PATCH/DELETE/default API 与 CORS 方法。Base URL 或凭据变化使旧目录失效。

**检查**：重启后配置保持；多个连接只允许一个默认项；非法 URL、重复目录项或不支持的协议报错；默认连接不能被直接删除。

### P2-03 `feat(secrets): store model credentials in system keyring`

**结果**：连接凭据只写系统凭据库。

**范围**：凭据存取适配、写入/清除接口、脱敏状态；数据库与凭据库跨存储操作定义成功顺序和失败补偿，失败不能报告“已配置”。删除连接时清理关联凭据。

**检查**：真实系统凭据库写入、替换、清除；读取 API、数据库和日志均无原文；凭据库不可用时明确失败。记录实际验证的操作系统。

### P2-04 `feat(models): add explicit streaming provider adapter`

**结果**：后端可进行真实连接检查、目录发现和流式调用。

**范围**：对照 maka-agent 的 `connection-model-discovery.ts` 和 `model-fetcher.ts`，实现按当前连接自动读取 `/models`、规范化并原子保存目录、失败保留同修订号有效旧目录/报告错误、显式刷新和独立手工添加；再实现唯一 OpenAI-compatible 适配器的增量文本、结构化 Tool Call、用量、超时和取消；显式 Provider 参数映射；过滤隐藏推理；补全 test/discover-models/manual-models API。不启用协议探测或静态模型名替代发现结果。

**检查**：用真实服务验证自动列出精确模型 ID、普通文本与工具调用；无效密钥、空列表、异常格式、网络超时、非法工具参数可区分；首次发现失败无可选模型；无密钥时不能伪造成功；配置不支持的推理强度被拒绝。

### P2-05 模型连接设置页 `feat(settings): manage model connections in existing shell`

**结果**：在现有设置 Shell 中交付可使用的模型连接列表页和详情页，完成连接配置闭环。这是模型连接设置页的前端开发项；P2-02、P2-03、P2-04 分别提供配置持久化、系统凭据库和模型发现/调用接口，不能代替本项页面。

**入口与文件**：在 `frontend/src/app/router.tsx` 增加 `#/settings/models` 和 `#/settings/models/:connectionId`；在 `frontend/src/features/settings/SettingsSidebar.tsx` 增加“模型”入口；页面和组件放入 `frontend/src/features/settings/models/`，复用 `frontend/src/features/settings/SettingsPage.tsx` 的 `SettingsPageWrapper`、`SettingsPageHeader` 与现有设置 Shell。以 `docs/ui-mockups/settings-model-v3.png` 为页面结构参考。

**范围**：列表页展示多个连接、状态、默认连接和新增入口；详情页展示协议、Base URL、脱敏凭据状态、模型目录和错误。完成创建/编辑/删除、设置唯一默认连接、写入型密钥、保存后自动发现状态、手动刷新、独立手工添加、模型启用选择、模型来源/上次成功时间、选定模型连接测试。清理离开页面后的密钥草稿。模型交互对齐 maka-agent，视觉组织参考 mu/deepseek-harness，不复制对方设置文案。

**检查**：通过 UI 创建连接并自动列出服务实际返回的模型名称，主动刷新可更新目录；选定模型完成真实检查；发现失败有明确状态和手工添加入口，不自动填入猜测名称；重新进入只显示 configured；归档设置页与返回会话操作保持正常；宽窄桌面布局无溢出。

### P2-06 `feat(runs): persist runs messages and ordered events`

**结果**：Run、模型快照、Assistant 和 ToolCall 拥有原子存储能力。

**范围**：扩展 Message、AgentEvent 和新增 Run/ToolCall 表；事务内分配会话 sequence；实现事件存储适配器、批量 delta 与正文进度；跨对象状态更新共用事务。

**检查**：从新开发库检查约束与顺序；不同 Run 不重置事件序号；提交失败时消息与事件均不残留半条记录；GET messages 能区分部分和完整正文。

### P2-07 `feat(dsh): reduce events into durable run state`

**结果**：可由已提交事件确定性恢复运行状态。

**范围**：对照 deepseek-harness `session` 的类型事件与派生投影，定义 Reducer、状态转移、Tool Call 配对、模型 attempt、预算累计与终态保护；持久状态表只是事务内更新的查询投影，不是第二个独立状态机。

**检查**：回放同一事件序列得到相同结果；非法转移报错；中断、取消、完成不会互相覆盖；恢复后预算和工具结果不丢失。

### P2-08 `feat(agent): add scoped context and local tools`

**结果**：GeoAgent 能读取当前工作空间并提出本地记忆写入。

**范围**：Context 注入当前会话、已完成消息、地图快照和确认记忆；白名单工具、参数 Schema、作用域校验与有界结果；WorkspaceMemory 表与 tool_call_id 唯一约束。写工具此时仅登记，不绕过下一项确认门禁。

**检查**：只读工具返回真实业务数据；跨空间 ID 被拒绝；模型不能指定文件路径、SQL 或 URL 执行；未批准记忆不出现在查询结果中。

### P2-09 `feat(confirmations): authorize exact local write snapshots`

**结果**：本地写入必须通过可恢复的精确确认。

**范围**：PolicyGate 的 L0/L2 决定；持久 Confirmation；查询、批准、拒绝接口；批准后本地写入和执行结果同事务落盘；重复与竞态决定处理。

**检查**：重复批准只写一次；篡改请求参数被拒绝；拒绝无副作用；批准和取消并发时只有一个有效结果；重启仍能读到原确认。

### P2-10 `feat(dsh): execute bounded model tool loops`

**结果**：Runner 完成模型—只读工具—模型的真实循环，并能等待确认。

**范围**：对照 deepseek-harness `agent-loop/src/agent.ts` 与 `tool-calls.ts` 的模型—工具循环和取消边界，从已提交 run_id 开始执行；组装上下文、处理流、合并 Tool Call、执行工具、应用预算、持久终态；确认时保存完整续行状态，不占用模型连接等待用户。首期工具串行执行。

**检查**：真实模型可调用 workspace.get_context 后回复；提出记忆写入时暂停；无效工具、调用超限和 Provider 断流有明确失败/中断状态，不生成假成功。

### P2-11 `feat(runs): coordinate scheduling cancellation and recovery`

**结果**：运行生命周期独立于 HTTP 请求和页面生命周期。

**范围**：FastAPI lifespan 装配 Host 和进程内调度；会话单 Run、全局并发上限；启动扫描、显式 resume/cancel；关闭中断落盘；修改/删除未完成 Run 引用的连接时返回冲突。

**检查**：刷新或切换页面不重启 Runner；关闭重启后能辨别完成、确认等待和中断；取消阻止晚到增量；恢复不重复本地写入、不重置预算。

### P2-12 `feat(api): accept idempotent messages with run snapshots`

**结果**：正式消息接口触发 DSH，并提供运行查询与管理保护。

**范围**：替换消息 POST 契约为第 4 节定义；持久幂等记录、原子受理与提交后调度；Run/确认查询；会话模型偏好；归档、移除、永久删除的事务级运行冲突检查。同步更新前端 API 类型、共享输入框的基本模型选择、SessionMessagesProvider 的请求/响应处理和 CORS 请求头，不能提交后端新契约却留下调用旧契约的界面。

**检查**：同 key 重试返回同一 Run；不同正文冲突；模型/上下文校验失败不追加用户消息；进程在提交后入队前退出不会丢失已受理 Run；已有归档和恢复语义不变。

### P2-13 `feat(conversation): select models and render assistant streams`

**结果**：从共享输入框发起真实运行并展示持久回复。

**范围**：完善上一项基本接线的连接/模型/推理强度选择与错误反馈；运行快照与地图上下文展示；请求 key 和失败草稿保持；Assistant 角色、部分状态、发送禁用与停止入口；重连时按 offset 合并快照和增量。

**检查**：无可用连接时显示明确配置入口；消息提交失败保留草稿和重试 key；对话、轨迹、地图切换不丢模型选择；重启恢复持久正文且不重复字句。

### P2-14 `feat(conversation): display confirmations and interrupted runs`

**结果**：用户可以批准精确操作、拒绝、取消或恢复运行。

**范围**：对话内确认卡片、执行范围/参数/副作用、提交中状态；Run 查询与 SSE 共用缓存；中断说明、恢复和取消按钮；归档/移除冲突提示。沿用 shadcn/ui，不新增全局阻塞弹窗流程。

**检查**：重复点击不重复写入；重启后的确认可继续处理；切换页面不丢待确认状态；终态 Run 没有可误触的恢复按钮。

### P2-15 `feat(trajectory): project real model tool and confirmation events`

**结果**：现有轨迹能解释真实运行过程。

**范围**：扩展现有 projection、model、ledger、inspector 与 timeline 输入；正确关联用户、Assistant、工具和确认；对话仅显示关键活动；真实开始/结束时间驱动耗时。保留现有时间线组件，不为本阶段做大规模拆分。

**检查**：工具参数和结果脱敏；时间线、记录表、详情指向同一对象；缺失用量/耗时为空；SSE 重连不重复记录；未知事件明确显示不支持。

### P2-16 `feat(scenes): validate built-in geoskill packages`

**结果**：内置场景是可校验的版本契约。

**范围**：按架构文档加载 manifest、SKILL、workflow、validation、presentation；分开报告结构有效性与外部依赖可用性；Scene DTO、列表和详情 API。洪涝场景只记录真实可确认的输入输出与规则，未完成的 OGE 服务绑定明确缺失。

**检查**：缺字段和无效包有明确错误；缺少 OGE 不标记为可执行，不填假 service_id；有效包仍能只读查看；场景文本不能改变 Tool 白名单和权限。

### P2-17 `feat(geoskills): browse versions and attach session context`

**结果**：用户可查看场景并为会话指定版本上下文。

**范围**：GeoSkill 只读目录与详情；会话 scene_id/version；scene.get 与 Context 精简场景约束；Run 冻结所选版本。依赖缺失时仅允许查看/作为讨论上下文，正式“开始分析”不可用。

**检查**：既有 Run 不随会话更换场景而变化；未完成 Run 期间不能换版本；界面不会把普通会话创建说成正式 OGE Task；Agent 不能发布或修改场景。

### P2-18 `docs: verify and record phase two delivery`

**结果**：形成真实可复现的阶段二交付记录。

**范围**：按第 2.1 节行为对齐表和第 6 节完成手工验收，逐项记录参考实现的输入/结果、本项目的输入/结果、平台、Provider/模型、已通过项、差异和未覆盖项；差异未修正不得标为对齐。更新架构文档与阶段状态。只记录实际执行结果。

**检查**：全部必须项完成才能标记阶段二已完成；没有凭据或真实模型验证条件时保留未完成状态，不用模拟回复替代。

## 6. 阶段验收

### 6.1 工程检查

- uv sync --project backend
- uv build --project backend，并检查构建产物包含 dsh 和 kunyu。
- uv run --project backend python -c "import dsh; import kunyu"
- npm run typecheck --prefix frontend
- npm run build --prefix frontend
- npm run typecheck --prefix electron
- git diff --check

### 6.2 桌面主链

1. 使用独立开发数据目录启动 Electron，确认仍由桌面拉起后端。
2. 在模型设置创建一个真实连接并写入凭据，确认自动发现服务实际返回的模型 ID、来源和时间；启用并选定模型完成连接检查，再主动刷新一次目录，核对启用选择与不可用提示。
3. 创建工作空间与会话，在对话输入框选择连接和模型，发送普通消息。
4. 确认用户消息与 Run 只创建一次，Assistant 实际流式输出，完成后重启仍可读取。
5. 发起需要 workspace.get_context 的请求，核对工具读取的真实空间与后续回复。
6. 请求保存一项工作空间偏好：未确认前查不到记忆；批准后只写一条；新 Run 能读取该记忆。
7. 再次提出写入并拒绝，确认无写入；同时检查对话活动和轨迹状态。
8. 在 waiting_confirmation 状态退出重启，确认还原同一快照，可批准或拒绝。
9. 在模型输出时取消，确认晚到内容不再写入；中断后保留部分正文但不显示完成。
10. 在运行期间归档会话、移除空间或改连接配置，确认返回明确冲突；取消后恢复正常管理操作。
11. 浏览 GeoSkill，确认依赖缺失有真实说明，不能发起尚未接通的 OGE 分析。
12. 验证四种会话视图、侧栏折叠、输入草稿、模型选择和地图视口的会话内切换。

### 6.3 故障与一致性

- 发送已受理但客户端未收到响应，使用同一 key 重试，不能再创建 Message/Run。
- 同一 Session 并发发送两个不同请求，只允许一个非终态 Run。
- SSE 断线后从最后 sequence 补发，与消息快照合并后无重复正文、无重复工具记录。
- Provider 无效密钥、断流、超时、无效 Tool Call 和用量缺失都有真实状态，不回退至其他模型。
- 模型运行期间强制终止后端，重启能区分 interrupted 与 completed，显式恢复不会盲目重放写工具。
- 批准与取消竞态、重复批准、写入提交后进程退出均不会重复 WorkspaceMemory。
- 在同一数据库正常关闭重启，确认配置、完成消息、工具结果和待确认快照仍然存在。
- 检查数据库、API 响应、SSE 与日志中没有模型密钥、桌面 token 或隐藏推理。

以上均为开发完成后应执行的验收，不是本计划已经通过的结果；本阶段默认不新增自动化测试文件。

## 7. 完成定义与阶段三交接

阶段二只有在真实模型、真实本地工具、确认写入和同库重启恢复全部通过后才完成。预期链路为：

```text
共享输入框 + ModelSelection + MapContext + Idempotency-Key
  → 应用服务原子写入 User Message / Run / 模型快照 / 创建事件
  → DSH Context → Model → Tool / Confirmation → Model
  → 持久 Assistant / ToolCall / RunState / 有序事件
  → REST 快照 + SSE → 对话 / 轨迹 / 运行操作
```

交给阶段三的稳定接口为 ModelAdapter、ToolRegistry、PolicyGate、EventStore、确认快照和 Run 恢复机制。阶段三再加入 OGE Profile、Task/RemoteJob、waiting_external、processId 监督与 Artifact，不重新实现模型设置或会话基础设施。
