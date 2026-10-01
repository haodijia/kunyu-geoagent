# 阶段二：最小 DSH 与模型运行闭环

> 状态：开发中；P2-01～P2-07A 已交付，其余开发项待实现。
>
> 基线日期：2026-09-28。阶段一已完成；本文以当前源码和[开发架构设计](../开发架构设计.md)为基线。
>
> 目标：在现有桌面会话中接入真实模型，完成用户消息、Assistant 流式回复、本地工具、精确确认、取消与重启恢复的闭环。阶段二不执行 OGE 作业。

> 模型连接设置页已按 [P2-05 模型连接设置页](#p2-05-模型连接设置页-featsettings-manage-model-connections-in-existing-shell) 交付：连接列表、供应商目录、连接表单与详情管理均已接入现有设置 Shell。

## 1. 开发方式

1. 按本文依赖顺序逐项开发，每个 commit 只交付对应结果。
2. 开始新的开发项前提交已有修改；完成本项检查后自动 commit，停止并等待用户审核，不自行进入下一项。
3. 后端使用 uv；数据库结构变更追加 Alembic revision，阶段开发完成后统一压缩为基线 SQL。前后端契约变更同步落地。
4. 不写假模型回复、假工具结果，不在失败时替换模型、协议、凭据存储或事件源。
5. 默认不新增测试文件。执行类型检查、构建、隔离数据目录下的手工接口检查和桌面验收；用户明确要求时再编写测试。
6. 开发前按第 2.1 节核对参考源码：模型连接页面只参考 maka-agent；ModelAdapter 与 Agent 运行架构继续参考 deepseek-harness。界面复用现有 shadcn/ui、Tailwind 和统一主题，不引入参考项目的组件库或无关业务。
7. 未完成或无法验证的能力明确记录，不把通过构建等同于真实模型或凭据持久化验收通过。

## 2. 从阶段一接续

| 已有能力 | 阶段二处理方式 |
| --- | --- |
| Electron 启停、Ready、健康与诊断 | 复用；增加 Runner 启停和关闭前的运行状态落盘 |
| api → application → domain、persistence | 保持分层，模型/Run/确认继续按职责放置 |
| SQLite WAL 与六张业务表 | 扩充当前 ORM，由 Alembic 顺序迁移；不在启动时清库 |
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
| maka-agent | `apps/desktop/src/renderer/settings/ProvidersPanel.tsx`、`provider-catalog-page.tsx`、`provider-add-form.tsx`、`provider-display.tsx`、`provider-brand-marks.tsx`、`provider-connection-detail.tsx`、`provider-enabled-model-manager.tsx`，以及主进程的 `connection-model-discovery.ts` | 模型设置对齐其四层页面流转：连接列表 → 供应商目录 → 连接表单 → 连接详情；复用紧凑供应商行、品牌图标、搜索/分类、凭据可展开行、模型多选和三段式详情结构。将 Electron IPC 连接管理与 `/models` 发现改为 FastAPI 应用服务；不移植账号 OAuth、非 OpenAI-compatible 协议或其组件库。 |
| deepseek-harness | `packages/llm/llm-pi-ai/src/adapter.ts`、`packages/llm/llm-pi-ai/src/stream.ts`、`packages/llm/llm-pi-ai/src/catalog.ts`、`packages/core/agent-loop/src/agent.ts`、`packages/core/agent-loop/src/tool-calls.ts`、`packages/core/session/src/index.ts`、`packages/core/session/src/surface.ts`、`packages/core/tools/src/index.ts` | ModelAdapter 以其调用快照、流事件转换、结构化 Tool Call、用量、超时/取消和显式 Provider 能力/参数配置为主要参考；产品消息过滤隐藏推理。Agent 运行对齐模型—工具—模型推进、可见历史重建、工具守卫、持久事件与恢复边界。落到本项目的 `kunyu.agent.runtime` Protocol、显式组件装配与 SQLite 事务，不照搬 pi-ai 或 Cordis。 |

只对齐下表明确列出的阶段二行为，不要求整个参考产品等价。开发时按“来源路径/符号 → 源行为 → 本项目契约 → 实现位置 → 验证结果”记录；不得把有意舍弃的行为重新引入。未列出的差异先按本文冻结契约处理并记录理由。每个实现 commit 正文均包含该映射及实际检查结果，不能仅写“参考 maka-agent/DSH”。

| 参考差异 | 本项目决定 |
| --- | --- |
| maka-agent 的静态 fallback 目录、默认模型补选、测试时自动选模型 | 不移植；无真实目录或显式手工条目则无可选模型，测试必须提交精确 model_id。 |
| maka-agent 的某些自定义中继创建失败提示及前端触发发现 | 发现错误必须可见；自动发现由后端拥有，页面卸载不取消已保存连接的发现。 |
| DSH 的通用 surface、并行工具、Provider 重试与推理 replay 数据 | 只保留串行工具、显式轮次与可重建历史；不自动重试模型，不保存隐藏推理。需要隐藏推理回传的协议模式本阶段明确不支持。 |
| DSH 的持久层和 approval 服务 | 补充参考 `packages/session/session-persistence/src/{index,handle,storage-contract}.ts`、`packages/interaction/user-approval/src/{index,types}.ts`；借鉴日志连续性、确认范围与取消边界。本项目的 SQLite 原子写入、拒绝结束 Run、确认跨重启与显式恢复是本地契约，不宣称直接等价。 |
| maka-agent 的非 OpenAI-compatible 供应商和账号登录 | 当前后端只有 OpenAI-compatible Chat Completions；供应商目录只提供能落到该协议的官方、聚合、本地和自定义入口。目录预设不改变运行协议，账号 OAuth 留到后续阶段。 |

以上路径按本地参考源码核对；不在文档或文件名添加源码 hash。P2-18 按“保留行为通过/有意差异符合本文/未完成”分别记录，不以修正有意差异为验收条件。

| 对齐场景 | 必须达到的可观察结果 |
| --- | --- |
| 创建或更新 OpenAI-compatible 连接 | 有可用凭据时自动读取该端点的模型列表；新密钥或端点触发重新发现；用户可主动刷新。发现结果保留精确 ID、来源和时间，刷新失败不冒充成功。 |
| 模型选择与检查 | 可用模型按真实目录展示；已移除或不可用模型有明确状态，不能悄悄换成另一个模型；测试结果明确指出实际测试的模型、成功或失败原因。 |
| 单 Agent 普通回复 | 已受理用户输入只进入一次历史；模型流式回复、完成状态和重启后的内容一致；下一次模型请求能看到已经提交的可见历史。 |
| Tool Call 与确认 | 完整结构化调用经过 Schema 和策略检查；工具结果进入后续模型请求；写入停在精确确认点，拒绝或重复批准不会产生副作用。 |
| 取消与恢复 | 取消终止当前调用并保留已交付的部分正文；重启能从已提交事实恢复同一 Run 的状态，未确认写入不会被自动重放。 |

## 3. 范围

### 3.1 本阶段交付

- 内部 Agent 的 ModelAdapter、Tool、PolicyGate、EventStore、Reducer 和 Runner，统一位于 kunyu 包。
- 多个模型连接、唯一默认连接、数据库凭据配置、连接测试与自动发现模型名称的目录。
- 一个明确的 OpenAI-compatible 协议适配器，支持真实文本流和结构化 Tool Call；Provider 差异使用显式配置处理。
- 输入框选择连接、模型和受支持的推理强度，Run 保存不可变模型与地图上下文快照。
- 持久 Assistant 消息、运行状态、工具调用、确认、错误与中断记录。
- 本地只读 memory_read，以及必须人工确认的 memory_write；记忆不自动注入上下文。
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

请求首先通过桌面身份、请求结构和会话访问校验。随后查找 `(session_id, idempotency_key)`：已受理且规范化正文相同，直接返回原 message/run；不同返回 409。此路径不重新检查当前连接、凭据、归档状态或当前场景，不再次调度。

新请求依次取得调度锁、当前连接的进程内操作锁（单后端进程），在数据库事务外读取凭据状态，再在 `BEGIN IMMEDIATE` 事务中再次查询幂等记录，然后：

1. 复核 Session 未归档、Workspace 未移除、连接无管理操作进行中，且模型、能力验证、配置修订号仍有效；凭据读取在连接锁内、事务外完成，密钥不进入事务记录。
2. 检查 MapContext 属于当前空间、场景版本结构有效、同一 Session 无非终态 Run，以及全局受理容量。
3. 原子写入 User Message、Run、模型/地图/场景快照、会话最近模型偏好及创建事件。
4. 保存规范化请求正文和 message_id/run_id，提交后调度 run_id。锁在提交后释放；不在数据库事务内等待模型网络请求。

响应为 202 `{message, run}`，重试也返回 202 与原 ID、当前持久状态；模型失败不回滚用户消息。Runner 不再次追加用户消息。永久删除会话同时删除幂等记录，之后重试返回 404。

规范化仅采用 DTO 明确的空值规则及 JSON 键排序，不裁剪正文或重排数组；保存正文用于相等比较，不添加 hash。Idempotency-Key 是客户端生成的 UUID。前端在进程内按会话保留未决请求的 key 和完整正文；超时、断网、5xx 后重试必须原样发送。确定的 4xx 允许修改并生成新 key；未决请求不得复用旧 key 发送修改后的正文。重启后从服务端历史恢复已受理结果，不承诺恢复未发送草稿或自动重发。

每个 Session 最多一个非终态 Run，通过部分唯一索引和事务检查保证。waiting_confirmation、interrupted、待调度 ready 占用的是**会话名额**；等待确认和中断不占全局执行并发。全局执行数、受理容量及恢复规则见第 4.12 节。

### 4.2 消息、事件与流

- Message.role 扩展为 user / assistant；工具请求和结果使用独立 ToolCall 记录，不伪装为用户消息。
- Assistant Message 包含 run_id、content、status，status 区分 streaming、completed、interrupted、failed、cancelled；部分正文不会被当成完整回复。
- Tool Call 的模型关联 ID、校验后参数、返回结果和状态持久保存，恢复后能够重建完整模型上下文。
- AgentEvent 沿用 id、session_id、sequence、event_type、payload、occurred_at，新增可空 run_id。
- 唯一顺序是 (session_id, sequence)；不能改成按 Run 递增，也不能因过滤某类事件留下游标空洞。
- SSE 帧 id 为 sequence 字符串；重连使用 after_sequence。JSON id 是事件主键，不作为订阅游标。
- Assistant 增量按有界批次持久化后再发布，payload 携带 message_id、attempt、offset、text；不要每个字符写一次 SQLite。
- GET messages 返回已持久化正文及状态。首次加载或重连按 message_id/offset 合并增量，已经包含在快照中的文本不重复追加。
- 每个模型 step 的 Assistant 完成与 message.assistant.completed 原子落盘；仅最终无 Tool Call 的正常回复同时提交 run.completed。有 Tool Call 时提交完整批次并进入工具/确认阶段，不结束 Run。Reducer、Run 状态表和消息记录必须共用事务。
- 流中不保存隐藏推理、API Key、Authorization 头或完整模型原始请求。Provider 的额外推理字段不进入产品消息与审计事件。

事件至少包括 run.created、run.model_selected、run.started、message.assistant.delta、message.assistant.completed、tool.requested、tool.started、tool.completed、tool.failed、confirmation.requested、confirmation.resolved、run.completed、run.failed、run.cancelled、run.interrupted、run.resumed。既有 session.created 和 message.user.appended 保持原语义。

### 4.3 模型连接

ModelConnection 保存稳定 ID、显示名、`provider_type`、协议类型、Base URL、认证方式、启用状态、默认标记、配置修订号、default_model_id（可空）、已启用模型 ID 集合及模型目录。`provider_type` 是供应商展示和图标的持久标识，不从显示名或 URL 推断；运行协议仍由独立 protocol 字段决定。目录条目保存 Provider 返回的精确 model_id、可选显示名、发现来源、发现时间，以及能被可靠确认的 Tool Call 和 reasoning_effort 能力；未知能力标记为 unknown，不能推断为支持。不向不支持或能力未知的模型发送推理参数。

- 本阶段协议类型仅 openai_compatible；认证方式显式为 api_key 或 none，none 只适用于用户明确配置的免密服务。
- reasoning_effort 为 null 或该模型支持的枚举值；不得把统一的 standard/high 标签不加转换地发给所有服务。
- 参考 maka-agent 的 `discoverConnectionModels → fetchProviderModels`：后端读取当前连接和凭据，向该连接 Base URL 对应的 OpenAI-compatible `GET /models` 发起受限请求，解析 `data[].id`，去空白、去重并限制 ID 长度和条目数。请求、响应格式、认证或空目录异常均返回脱敏错误；不猜测模型名。
- 保存连接且凭据就绪后自动触发一次发现；Base URL 或凭据更新后使旧目录不再可选，并对新配置重新发现。设置页提供“刷新模型列表”；刷新失败不覆盖同一修订号下已有的有效目录，但显示失败和上次成功时间。首次发现失败时连接保持“无可选模型”，不把内置名称当作真实发现结果。
- 用户也可在独立的“手工添加模型”操作中明确填写精确 model_id，来源标为 manual；不会因发现失败自动进入手工模式。手工条目需通过真实连接检查后才可用于 Run。自动发现的条目和手工条目分别标记来源，不伪造能力元数据。
- 模型列表发现与连接测试分开：`GET /models` 成功只能证明目录可读；连接测试必须针对选定 model_id 发起真实受限调用，Tool Call 能力需要真实验证或可靠的 Provider 元数据，不能由名字猜测。
- 对齐 maka-agent 的模型启用选择：目录可以列出多个模型，用户启用的模型才进入会话选择器；默认模型若不在当前可用且已启用的集合中，设置页明确提示并要求重新选择，不把失效 ID 静默替换。目录刷新后保留仍存在的启用选择，移除的 ID 显示为不可用。
- 凭据写入 SQLite 独立表，查询仅返回 configured、状态和更新时间，详见 4.10。API Key 不进入前端持久化、场景包、接口响应或日志。
- 数据库文件仅允许当前用户读写；首期本地桌面威胁边界接受凭据在本机数据库中明文持久化，不使用密文与解密密钥同库存放的伪加密。
- 默认连接由事务和唯一约束保证最多一个；没有默认连接时要求用户选择，不自行选第一项。
- RunModelSnapshot 冻结连接 ID、协议、Base URL、认证方式、模型 ID、推理参数与配置修订号，不含凭据原文。提交前校验 model_id 属于当前修订号下可用、已启用且已验证的目录；已被刷新移除的模型不能继续作为新 Run 默认值。
- 未完成 Run 引用的连接禁止改配置、替换/删除凭据、禁用或删除；防止中断恢复时悄悄使用不同运行条件。终态 Run 保留快照，不要求原连接永远存在。

### 4.4 工具与确认

| 工具 | 作用 | 级别 | 执行规则 |
| --- | --- | --- | --- |
| memory_read | 读取当前空间已确认的记忆 | L0 | 空查询列出最近记忆，非空查询按字面关键词筛选，不跨空间 |
| memory_write | 保存用户确认的空间偏好或关注事项 | L2 | 每次生成精确确认，批准后落盘 |
| scene.get | 读取内置场景版本的约束和依赖状态 | L0 | 在 GeoSkill 交付项接入后注册 |

本阶段不注册删除数据、修改模型配置、读系统文件、执行 Shell、提交 OGE 等 Tool。模型提供的 scope 标识必须由服务端约束，不能只依赖提示词。

确认对象保存 confirmation_id、run_id、tool_call_id、工具名、校验后的参数、可读摘要、状态与决定时间。批准/拒绝通过路径提交确认标识和决定，请求体为空对象，不接收替换参数。本阶段不提供修改待确认参数接口；用户取消原 Run 后，以新消息生成新的提议和确认。

memory_write 的写入、ToolCall 完成、确认决定及事件在同一个本地数据库事务内提交；tool_call_id 唯一约束防止重复执行。批准、拒绝、取消争夺待确认状态时使用条件更新，只有一个决定获得写入资格，不能“先执行再保存确认”；批准已提交后再取消只停止后续工作，不撤销写入。

拒绝结束该次 Run 为 cancelled，不自动重新提议相同写入。记忆候选在用户批准前不能被 memory_read 作为事实返回。

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

关闭时拒绝新 Run 和新的执行调度，停止模型网络流，等待正在提交的短数据库事务，仅将 model_running/tool_running 转为 interrupted；ready 与 waiting_confirmation 保持原状态。取消操作落盘后不能再提交晚到的 delta 或工具写入；取消与工具提交采用同一状态检查/事务顺序。

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
| DELETE /model-connections/{id}/manual-models?model_id=... | 删除 manual 来源；fetched 来源存在时保留目录条目 |
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

发送参数错误返回 422；资源不存在返回 404；归档、忙碌、幂等正文冲突或确认状态冲突返回 409。配置、数据库和 Provider 错误分别使用稳定错误码与脱敏摘要，前端文案放入 locales。

### 4.7 目录与数据

新增目录按需建立，不预先创建空模块：

```text
backend/src/kunyu/agent/runtime/ # 运行契约、Runner、Reducer
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

更改已有表结构时追加连续 Alembic revision；启动时只执行已声明的迁移，不自动清库。迁移失败必须保留原错误并停止启动；恢复验收必须在同一数据库上重启。阶段开发完成后将 revision 历史压缩成一份基线 SQL。

### 4.8 DSH 的职责与装配顺序

借鉴 deepseek-harness 的 `agent-loop`、`session`、`tools` 三个接缝，阶段二只实现单一 `GeoAgent` 的最小闭环：

1. `kunyu.agent.bootstrap` 显式创建并注入 EventStore、ModelAdapter、Context、ToolRegistry、PolicyGate 和 Runner；应用生命周期管理后台任务、HTTP client 和数据库，不使用插件 Host。
2. `kunyu.agent.runtime.runner` 只消费已受理的 run_id，从不可变快照构建模型请求；一次模型响应中的 Tool Call 先组装完整，再按模型关联 ID 校验、登记、过 PolicyGate 和执行。写工具停在持久确认点，不占用模型网络流等待用户。
3. 事件存储契约负责会话内有序追加；`kunyu.agent.runtime.reducer` 从已提交事件得到 Session/Run 投影。P2-07A 后 `agent_events` 是 Agent 会话与运行事实的唯一事实源，`messages`、`runs`、`run_model_snapshots` 和 `tool_calls` 是可丢弃、可重建的查询投影。`kunyu` 的 SQLite 适配器在同一事务中追加事件并更新投影，禁止绕过 Reducer 直接改变 Agent 状态。WorkspaceMemory、Workspace 和 Artifact 等业务对象不是 Agent 查询投影，仍由各自业务聚合持有。
4. `kunyu.agent.runtime.tools` 声明 Schema 和调用契约；`kunyu.agent.tools` 提供白名单业务实现。参数校验和 PolicyGate 位于实际执行之前，模型不能通过提示词、工具名或自报 scope 绕过权限。
5. Runner 的取消信号终止模型流和未执行工具；已持久的部分正文保持 `interrupted`/`cancelled` 状态。重启只从日志与快照重建，恢复由用户显式触发，不重放状态不明的写入。

组件以代码显式装配和依赖注入。`kunyu.agent.runtime` 不依赖 FastAPI、SQLAlchemy、具体业务工具或模型 SDK；业务服务与适配器拥有事务、凭据与 API。不实现 Cordis 运行时、动态插件加载、通用消息 surface 或多 Agent；工具支持有界并行和独占调度。

### 4.9 模型适配、验证与目录并发

首期固定 Chat Completions wire protocol：Base URL 为包含可选路径前缀的绝对 http/https 地址，去掉尾部 `/` 后追加 `/models` 或 `/chat/completions`；不猜测或补 `/v1`。禁止 userinfo、query、fragment；不跟随重定向发送凭据。认证为 Bearer API Key 或显式 none。不支持 Responses 协议、任意额外请求参数及需要隐藏推理回传的模式；不支持时明确报错。

P2-04B 必须扩展已交付的 `kunyu.agent.runtime.models`：

- ModelRequest 绑定唯一 RunModelSnapshot 对应的适配器配置，包含输出 Token 上限；取消由 Runner 取消调用任务并关闭 HTTP 流，不以停止读取界面作为取消。
- 输出除 TextDelta、完整 ModelToolCall、可空 TokenUsage 外，必须有一次终止结果：`stop / tool_calls / length / content_filter`。网络、认证、无终止事件、非法 JSON 等通过稳定异常契约报告，不能把迭代结束直接视为成功。
- `stop` 且有正文、无工具才可完成 Run；`tool_calls` 必须有非空且完整合法的批次；`length` 和 `content_filter` 保留已提交正文并失败。空正常回复、重复 call_id、结束原因与内容矛盾均为协议错误。`[DONE]` 不能代替 finish_reason；获得完整终止记录之前不执行工具。
- 标准请求仅发送 model/messages/stream/tools/tool_choice/max_tokens/max_completion_tokens/stream_options/reasoning_effort 中本次适用的字段；输出上限字段由显式 `max_tokens_field=max_tokens|max_completion_tokens` 配置。用量开关 `include_usage` 显式配置，true 时发送 stream_options.include_usage=true，默认 false，不因请求失败自动改参。上述配置进入连接修订及 Run 快照。
- reasoning_effort 首期只支持标准同名 wire 字段。可靠元数据映射由后端显式 Provider 配置提供，声明精确模型、枚举和来源；无元数据时保持 unknown、UI 只提供 null，不靠模型名称推断，也不开放任意 JSON 参数编辑。

每个 `(connection_id, config_revision, model_id)` 保存 `text_check`、`tool_check`（unchecked/passed/failed）、各自 checked_at、脱敏 error_code，以及 reasoning 能力及来源。`POST test` 必填 model_id 与 `mode=text|tools`：text 执行一次有界真实文本调用；tools 先完成文本检查，再用一个无副作用的探测函数验证结构化调用，探测不注册业务 Tool、不写 WorkspaceMemory，未收到预期调用就判定工具验证失败。真实验证产生的费用/用量按可得数据展示。

GeoAgent 的新 Run 必须同时通过当前修订的文本和工具检查；text-only 成功只证明连接可调用，不代表可启动 Agent。设置页分开展示两个状态，默认操作是 tools 完整检查。未通过验证的模型仍可在设置页选中进行检查，但不进入会话可发送集合。推理强度仍以可靠枚举为准；测试成功不推断其它能力。

连接执行配置（URL、认证、凭据、输出字段、用量参数）变化递增修订号并使验证和旧目录失效；名称、默认选择与启用集合变更不递增执行修订，但仍受未完成 Run 管理保护。配置修订的锁定、验证记录读取与新 Run 受理使用同一连接操作锁。默认模型必须属于当前可用、已启用且通过 Agent 验证的集合；初次创建可为 null，不隐式补选。

目录发现按连接锁分配递增 discovery_generation，并捕获配置修订与凭据，在锁外执行网络请求；落盘时重新取得锁，只接受修订号及 generation 均匹配的结果。旧结果返回 `DISCOVERY_SUPERSEDED`，不得覆盖新目录或错误状态。test 使用同样的修订检查及独立检查 generation，过期结果不得写入验证状态。网络期间不持有 SQLite 写事务。

发现成功只替换 fetched 条目，保留仍存在 ID 的启用和验证记录；消失的 fetched ID 保留 unavailable 标记并清除验证，重新出现后需要重测。manual 条目不因远端列表缺失而删除；相同 ID 不创建两条记录，以来源集合记录 manual/fetched，两种来源均不等于能力证明。目录失败保留同修订成功结果；首次失败无 fetched 可选项。

保存连接/凭据与发现是两个结果：保存成功即返回 201/200 的脱敏 ConnectionDTO，discovery 状态为 pending；后端托管发现，详情页仅在 pending 时轮询 GET。发现失败保留保存结果并显示 failed/error_code，不返回“保存失败”。重启时未完成发现标为 interrupted，用户手动刷新；不会冒充成功或静默换目录。

### 4.10 凭据操作与持久事务

所有连接修改、凭据操作、删除及新 Run 受理共享按 connection_id 的操作锁；新建连接先完成数据库创建。首期只运行一个后端进程，不支持多 worker。数据库事务独立校验未完成 Run，连接锁不能替代数据库约束。

API Key 作为模型连接的本地配置写入独立 `ModelCredential` 表，凭据替换/清除与连接投影采用单个 SQLite 事务：

1. 在连接锁内开启写事务，检查连接存在、认证方式匹配且无未完成 Run。
2. 写入或删除该连接唯一的凭据记录，同时更新 configured/updated_at、配置修订号，并使目录和验证结果失效。
3. 任一步失败都回滚整个事务；接口不得报告已配置，也不创建需要跨存储补偿的中间状态。
4. API Key 原文只允许从凭据仓储读取给模型调用方，不进入 ConnectionDTO、错误详情、事件、日志、前端持久化或导出包。

连接删除在同一事务内删除连接，由外键级联清理凭据、目录和检查记录。默认连接禁止删除，需先把默认切到另一个连接或 PATCH is_default=false 清除默认。set-default 原子清除其它默认；不能通过 PATCH is_default=true 绕过该服务。所有日志只含标识、操作类型、错误码与脱敏摘要。

持久约束和归属如下：

| 对象 | 必须约束与删除规则 |
| --- | --- |
| ModelConnection / ModelCredential / ModelCatalogEntry | is_default=true 的部分唯一索引；每个连接至多一条凭据；目录唯一 `(connection_id, model_id)`，来源/可用性/检查均绑定修订。删除连接级联凭据和目录，不级联历史 Run。 |
| Run / RunModelSnapshot | Session 下非终态部分唯一索引；快照与 Run 一对一，所有权不能跨 Session；历史 connection_id 是来源标识，不使用会阻止删除连接的外键。 |
| Message / ToolCall | Message 保持会话 sequence 唯一；Assistant 唯一 `(run_id, step, attempt)`。ToolCall 内部 id 全局唯一，Provider call_id 仅在 `(run_id, step, attempt)` 内唯一，另存 batch_index。 |
| Confirmation / WorkspaceMemory | 每个 ToolCall 至多一个确认；Memory.source_tool_call_id 唯一。确认绑定原始工具参数和 workspace/session，不接受客户端改 scope。 |
| AgentEvent / 幂等记录 | 事件唯一 `(session_id, sequence)`；`run_id` 是事件事实中的稳定标识，不得外键依赖 `runs` 查询投影；幂等唯一 `(session_id, key)`。所有 run/message/tool 关联须验证同属当前 Session。 |
| SessionPreference / 删除 | 偏好每会话一条，引用失效只提示重新选择；永久删除会话级联 Run、消息、事件、确认、工具和幂等记录。已确认 WorkspaceMemory 属于空间，保留原调用 ID 为来源值，不随会话删除；移除 Workspace 仅软移除。 |

EventStore 的单事件 append 不得自行形成与业务写入分离的提交。P2-06 提供业务无关的批次提交/工作单元接缝，SQLite 实现拥有一次事务：读持久状态 → Reducer 验证事件 → 更新消息/工具/确认/状态投影 → 分配事件序号 → commit。模型与凭据 I/O 不进入该事务。取消和批准走同一提交入口及条件更新。

Agent 投影表不得携带事件中缺失的独占事实。投影重建只读取按 `(session_id, sequence)` 排序的 `agent_events`，不读旧投影表补全字段，不调用模型或工具，不重放 WorkspaceMemory 等外部副作用。日常提交路径与全量重建必须共用同一组 Reducer 和投影写入器，避免形成第二套状态规则。幂等受理记录、会话偏好及业务聚合不属于 Agent 查询投影。

### 4.11 模型轮次、历史与流式一致性

step 从 1 开始，每次正常模型—工具推进递增；attempt 从 1 开始，同一步中断恢复时递增。每个 attempt 新建 Assistant message_id；旧部分正文保留原状态，不覆盖、不与新正文拼接。User Message 只对应一次 Run 受理。

模型历史由已提交的完整 step 按顺序构建：assistant 正文及该批完整 tool_calls → 按 batch_index 排列的全部 tool 结果。普通完成回复进入后续历史；失败或中断 attempt 的部分正文仅用于展示，不作为完整模型输入。当前 Run 的用户消息恰好一次。某工具批次没有完整结果时，整个 assistant/tool 批次不进入后续新 Run 的模型历史；已确认记忆仍可作为业务事实读取，不伪造未执行工具结果。

一轮包含多个工具时先完整登记全部调用，再串行推进。每次完成结果与 `next_tool_index` 同事务落盘；读工具完成后才看下一项。遇写工具只生成当前项确认并暂停，后续项保持 pending；批准后本地写入、结果、确认、游标以及下一持久续行状态在同一事务提交，然后调度剩余项。提交后调度前退出时从持久游标恢复，绝不重做已完成工具。所有工具完成后才调用下一模型 step。

拒绝或取消把 pending confirmation 变为 rejected/cancelled，未执行工具变为 cancelled，并提交 Run.cancelled；已完成写入保留事实、不回滚。重复相同批准/拒绝返回同一结果 200，不再次执行或调度；相反决定或已被取消返回 409。已批准后再取消可停止后续工作，但不能声称撤销已提交记忆；竞态以事务先后决定副作用是否发生。

事件 payload 在 P2-06 前冻结，至少包含以下事实；event_type 与 payload 使用可校验的闭合联合类型：

| 事件组 | payload 必要信息 |
| --- | --- |
| message.user.appended | message_id、完整 content、可空 run_id；role 固定为 user，顺序与时间使用事件信封，不得回查 `messages` 表补齐。 |
| run.created / model_selected | user_message_id、运行快照/版本、预算上限；重建不得查询后来变化的连接配置。 |
| run.started / resumed / interrupted / recovery_required | step、attempt、resume_phase、next_tool_index、requires_resume、queue_sequence、暂停原因、累计预算；恢复时不得重置累计值。 |
| run.budget_reserved / settled | operation_id、模型/工具类型、次数、预留额度、结算实际耗时或崩溃扣减，足以重放累计预算。 |
| message.assistant.started / delta / completed | started 含 message_id/step/attempt；delta 含 offset/text；completed 含持久正文长度和结束原因。 |
| model.attempt.finished | step/attempt、结束结果/错误码、可空用量及累计活动耗时。 |
| tool.requested / started / completed / failed / cancelled | 内部 tool_call_id、Provider call_id、message_id、batch_index；requested 含已验证参数，完成含真实结果，失败含脱敏错误，推进包含 next_tool_index。 |
| confirmation.requested / resolved | confirmation_id、tool_call_id、精确参数快照/摘要、决定及时间。 |
| run.completed / failed / cancelled | 最终状态、原因、预算累计；同事务结算仍 streaming 的消息及 pending 工具/确认。 |

启动或关闭将运行态变更时同样追加事件，不能只改状态表。Reducer 转移允许：ready→model_running/tool_running；model_running→tool_running/waiting_confirmation/completed/failed/interrupted/cancelled；tool_running→model_running/waiting_confirmation/failed/interrupted/cancelled；waiting_confirmation→ready/cancelled；interrupted→ready/cancelled；ready→cancelled/failed；旧 ready 的 recovery_required 与用户 resumed 可在 ready 内更新调度标记，不创建新 Run。ready 的 resume_phase 明确下一步是模型还是未完工具；resume 本身只入队，不直接假定恢复模型。waiting_confirmation 只能决定或取消，不可调用 resume；终态不可复活。

正文 offset/length 统一为 Unicode 码点数量；后端使用码点计数，前端使用 `Array.from(text)`，不能使用 JS 字符串 length 代替。delta 为追加前 offset；批次阈值为 50 ms 或 1,024 码点，先到者触发持久化，结束时提交余量。

GET messages 保持列表响应，每条新增 run_id、step、attempt、status、content_length、updated_sequence。用户消息 status=completed，step/attempt=null；阶段一已有消息 run_id=null。Assistant started 必须先于其 delta 发布。前端按 message_id 和 updated_sequence 合并：旧 REST 快照不得覆盖新增量；完整重叠增量忽略，部分重叠只追加尾部，缺口则暂停该消息合并并重新读取快照。SSE 游标只在事件已应用或入有界待合并缓冲后推进；缓冲最多 256 条，超限重新取快照并从此前安全游标重连。不重置会话 sequence，不混合不同 attempt。

P2-12 起 SessionEventProvider 向消息缓存分发原始类型事件，同时供轨迹投影使用；不能先丢弃 delta 再试图从轨迹记录重建。移除当前“每个事件使完整消息列表失效”的做法，常规 delta 更新缓存，重连/缺口再查快照。P2-15 只完善轨迹呈现，不拥有消息事件接收能力。

### 4.12 调度、预算与生命周期常量

首期固定值集中定义在后端运行配置，不开放设置 UI：全局同时执行 4 个 Run；ready 且 requires_resume=false 的排队最多 32 个（不含正在执行/确认等待/中断/待用户恢复），容量满时新发送或 resume/approve 返回 429 `RUN_QUEUE_FULL` 且不产生本次副作用。批准入队容量预留、确认写入与 ready 转移共享调度锁和数据库事务；容量已满时保持原确认。锁顺序固定为调度锁 → 连接锁（如需）→ SQLite 事务，禁止逆序等待。ready 按受理/恢复入队顺序 FIFO，以持久 queue_sequence 排序。

等待确认、中断释放执行名额；用户恢复先原子置 ready 并获得队列位置，同一 Run 重复调度由状态条件更新拒绝。启动扫描不自动执行旧 ready，标记 requires_resume=true；用户 resume 才解除。正常受理/批准产生的 ready 允许调度。重启后 model_running/tool_running 标 interrupted，等待确认保持；读工具可重做，已完成工具直接跳过，写入只能从已提交事务事实判断。

每 Run 最多 8 次模型调用（包括恢复的新 attempt）、16 次工具调用、300 秒活动时间、32,768 个输出码点；每次模型 max tokens 为 4,096。HTTP 连接超时 10 秒、流空闲超时 30 秒；目录与验证调用总超时 30 秒、响应体上限 2 MiB，目录最多 2,000 项、ID 最长 256 码点；检查调用输出上限 128 tokens；超出目录数/ID/体积上限整次发现失败，不截断后冒充完整目录。工具参数与结果各最多 16 KiB JSON，单次本地只读工具最多 5 秒。

恢复重做的工具也消耗调用次数，已提交写入的跳过不计一次新执行。Token 用量只记录 Provider 确实报告的值；缺失时累计对应维度为 null，并保留已知小计，不能以零替代。Token 不作为未知用量下的唯一硬预算。

活动时间包括模型/工具执行，不含排队和用户等待。每次模型调用预留 min(60 秒, 剩余活动预算)、工具执行预留 min(5 秒, 剩余活动预算)，并以该时间片为硬超时，执行前持久扣留、正常结束返还未用额度；崩溃留下未结算时间片时按预留上限计入活动预算，避免反复重启获得无限额度，并在 DTO 标明该段是预算扣减而非实际测量耗时。UI 的实际耗时缺失保持 null。

系统 shutdown 请求处理先设置 closing 信号，使所有 SSE 主动结束，然后请求 Uvicorn 退出；不能等 lifespan finally 才关 SSE，避免其阻塞请求排空。信号退出走相同关闭入口。关闭按顺序停止受理/批准/恢复 → 取消模型流及未开始工具 → 等待短事务 → 持久中断 → 关闭 HTTP client/数据库。后端关闭预算 3 秒，配合 Electron 当前 5 秒退出等待；不修改 waiting_confirmation。超过期限仍由 Electron 强制结束，启动扫描依据持久事实恢复。P2-11 手工验证活跃 SSE、确认等待、模型流和写事务四种关闭场景，不能只验证无任务退出。

### 4.13 API DTO、错误与工具参数

API JSON 使用 snake_case；已有 MapContext 在 API 边界显式映射，前端 store 保留现有 camelCase，不同时接受两套命名。未知请求字段返回 422。

| 操作 | 请求与响应补充 |
| --- | --- |
| 创建连接 | `{display_name, provider_type, protocol:"openai_compatible", base_url, auth_mode, max_tokens_field, include_usage}`；provider_type 使用后端闭合枚举，只负责供应商身份和图标；不在该接口接收密钥。201 ConnectionDTO，初始 default_model_id=null、enabled=true、is_default=false。 |
| PATCH 连接 | 只允许 display_name/base_url/auth_mode/enabled/enabled_model_ids/default_model_id/max_tokens_field/include_usage 及 is_default=false；显式字段白名单、整项校验后原子保存。 |
| 凭据 | PUT `{api_key}`，非空且最长 8,192 字符；DELETE 无正文。200 ConnectionDTO；密钥不回显。 |
| 发现 / 手工添加 | POST discover-models `{}`，200 `{revision,generation,entries,discovered_at}`；失败为稳定错误。manual-models `{model_id}` 返回 201 CatalogEntry；已有 fetched 条目则为其增加 manual 来源，不复制记录；已有 manual 来源返回 409。手工条目删除使用 `DELETE /model-connections/{id}/manual-models?model_id=...`，查询参数 model_id 必须 URL 编码以支持含 `/` 的模型名；有 fetched 来源时只移除 manual 来源。 |
| 模型测试 | `{model_id,mode:"text"|"tools"}`；200 `{model_id,revision,status,checks,latency_ms,error_code}`。Provider 检查失败为 status=failed；工具探测与 Agent 调用一致使用 `tool_choice=auto` 并只提供唯一探测函数，返回仍须严格验证函数名和参数 Schema，不能仅凭模型返回任意工具或普通文本就判成功；前置条件不满足或结果过期按错误状态返回。 |
| 发送消息 | `{content,model_selection:{connection_id,model_id,reasoning_effort},map_context}`；content 1～32,768 码点且不全空白。场景从当前会话事务读取，不接受请求覆盖 scene。202 `{message,run}`。 |
| 确认 / 取消 / 恢复 | approve/reject/resume/cancel 请求体 `{}`；确认返回 `{confirmation,tool_call,run}`，运行操作返回 RunDTO。cancel 对任意终态返回 200 原状态；resume 对终态/运行态返回 409。 |
| 会话场景 | PUT `{scene_id,version}` 或 `{scene_id:null,version:null}` 清除；200 SessionPreference。结构无效版本不能绑定，依赖缺失可作讨论上下文。 |

ConnectionDTO 包含 provider_type、配置字段、revision、credential `{status:ready|missing,configured:boolean,updated_at}`、management_status、discovery `{status:idle|pending|succeeded|failed|interrupted,generation,last_success_at,error_code}` 与目录 entries。CatalogEntry 包含 model_id、sources、revision、availability、enabled、checks、tool capability、reasoning 枚举/来源。RunDTO 包含 id/session_id/user_message_id、state、model/map/scene snapshots、step/attempt、resume_phase/next_tool_index、requires_resume、预算、暂停原因、pending_confirmation_id、created_at/updated_at/updated_sequence；不得含密钥或原始模型请求。

GET messages 保持数组；GET runs、confirmations、model-connections、scenes 首期也返回数组。列表只暴露摘要，工具结果通过 RunDTO 的 tool_calls 脱敏明细读取；确认列表足以还原精确卡片，不依赖曾收到的 SSE。

MapContext DTO 使用现有字段对应的 snake_case：workspace_id、viewport（latitude/longitude/zoom）、event_id、selected_aoi_id、selected_feature、visible_layer_ids、active_result_layer_id、active_observation_id、comparison_observation_ids。阶段二无真实图层/观测，所有引用只能 null 或空数组；非空返回 422，不能接受尚不存在的资源。经纬度分别限制 [-90,90]/[-180,180]，zoom [0,24]，所有数值必须有限。

统一错误体为 `{error:{code,message,details}}`，message 为脱敏摘要，details 仅白名单字段；前端按 code 映射 locales。固定基础错误码：422 `INVALID_INPUT/MODEL_UNVERIFIED/UNSUPPORTED_CAPABILITY/SCENE_INVALID`；404 `NOT_FOUND`；409 `SESSION_ARCHIVED/WORKSPACE_REMOVED/RUN_CONFLICT/IDEMPOTENCY_CONFLICT/CONFIRMATION_CONFLICT/CONNECTION_IN_USE/DEFAULT_CONNECTION/CONNECTION_BUSY/DISCOVERY_SUPERSEDED/CHECK_SUPERSEDED/MODEL_EXISTS`；429 `RUN_QUEUE_FULL`；503 `CREDENTIAL_STORE_UNAVAILABLE/CREDENTIAL_RECOVERY_REQUIRED/SHUTTING_DOWN`。发现网络/认证/格式失败使用 502 `PROVIDER_AUTH/PROVIDER_PROTOCOL/PROVIDER_NETWORK` 或 504 `PROVIDER_TIMEOUT`。运行中的同类错误写入 Run，不改变已受理 POST 的结果。

当前工具 Schema：memory_read 为 `{query?:string,limit?:integer}`，query 0～200 码点（默认空字符串，列出最近记忆）、limit 1～20（默认 20）；memory_write 为 `{content:string}`，content 1～2,000 码点；scene.get 为 `{}`，读取该 Run 冻结版本，无场景返回明确 null。均禁止额外字段，workspace/session 只能来自后端绑定。memory_read 使用有界字面关键词包含查询、按 created_at DESC/id DESC 排序，不执行模型提供的 SQL；结果明确截断与总条数，不能伪造遗漏内容。

### 4.14 GeoSkill 最小包契约

P2-16 使用 Pydantic 校验以下 YAML DTO，禁止任意 Python/YAML 对象构造、未知字段与包外路径；SKILL.md 只读取 UTF-8 文本，不执行其中指令。五个文件必须存在，总大小不超过 1 MiB，scene_id/version 在内置目录唯一。结构错误显示诊断，不加载为可选上下文；外部依赖缺失不等于结构错误。

| 文件 | 首期必需字段与规则 |
| --- | --- |
| manifest.yaml | scene_id/version/title/summary；inputs/outputs 各为 `{id,type,required,description}` 数组，type 限 string/number/boolean/geometry/raster/vector；dependencies 为 `{kind:tool|oge,id,service_id:string|null}` 数组。OGE 未绑定必须明确 null，不能造 ID。 |
| SKILL.md | 非空方法说明文本；作为低信任领域参考注入，不能新增 Tool 或改变确认策略。 |
| workflow.yaml | steps 数组，项为 `{id,description,depends_on,capability_id,input_refs,output_ids}`；验证 ID 唯一、引用存在、无环。首期只描述有序步骤，不实现可执行条件表达式或脚本。 |
| validation.yaml | rules 数组，项为 `{id,description,target,kind:required|coverage|completeness}`；target 必须引用声明的输入/输出，规则仅作说明与后续校验契约，不宣称已执行 OGE 质量检查。 |
| presentation.yaml | `{plan_fields,layer_styles,statistic_fields,report_sections}`；引用 manifest 输出，layer_styles 项为 `{output_id,color,opacity}`，颜色为 #RRGGBB、opacity [0,1]；无结果时允许显式空数组。 |

Scene DTO 分开返回 structure_status=valid|invalid、dependency_status=ready|blocked、executable、diagnostics，以及版本内容摘要。阶段二 executable 恒为 false，理由为 OGE 执行未接入；有效版本可绑定讨论。Run 快照保存 scene_id/version 和注入的精简约束正文，scene.get 读取该快照；不能仅凭版本号重新读取可能变化的本地文件。包内容变更必须新版本，旧 Run 不受安装目录变化影响。

## 5. Commit 计划

P2-01 最初采用独立 dsh 包；2026-10-01 已收拢为 `kunyu.agent.runtime`，移除未实际使用的插件内核及双包配置。后续结构以[后端 Agent 结构](后端Agent结构.md)为准。

依赖顺序：P2-01 → P2-02 → P2-03 → P2-04A → P2-04B → P2-05 → P2-06 → P2-07 → P2-07A → P2-08 → P2-09 → P2-10 → P2-11 → P2-12 → P2-13 → P2-14 → P2-15 → P2-16 → P2-17 → P2-18。P2-04 拆成 A/B，保留其它编号与现有页面链接。每项注明前置、对外变化和人工验证方法；内部能力尚未接入 API 时使用 uv 临时脚本调用真实仓储/服务检查，不新增测试文件、假服务或临时公开调试路由。

P2-02～11 不启用正式消息 Run 入口：旧消息功能持续可用，新增内部能力不自动启动执行。P2-12 一次性切换消息受理、最小 Assistant 展示、幂等请求和活动 Run 操作，不保留两套发送协议；P2-13～15 完善体验。内部已变更的 GET DTO 也必须同步前端类型和最低限度展示，不能等后续页面项才修正。

### P2-01 运行契约与组装（已交付，结构已调整）

**结果**：后端统一发布 kunyu 包；运行契约、Runner、Reducer 位于 `kunyu.agent.runtime`，业务工具按功能位于 `kunyu.agent.tools`。

**范围**：参考 harness 的模型—工具循环、事件重放与工具边界。`bootstrap.py` 显式组装组件，不保留通用插件内核或旧导入兼容层；工具自行声明风险级别，本地写入通过注册处理器与确认事件共同提交。

**检查**：uv 环境可导入 `kunyu.agent.runtime` 与业务模块；安装包包含全部内部模块和提示词资源。具体重构验证记录见[后端 Agent 结构](后端Agent结构.md)。

### P2-02 `feat(models): persist connections and model catalog`（已交付）

**结果**：模型连接、目录和默认选择有正式领域与存储契约。

**范围**：对照 maka-agent 的 `llm-connections.ts` 和 `model-catalog.ts`，实现四层模型配置、唯一默认约束、协议/认证方式、已启用模型 ID、模型目录来源与发现时间、能力 unknown 状态和配置修订号；不保存 API Key。新增 GET/POST/PATCH/DELETE/default API 与 CORS 方法。Base URL 变化使旧目录失效；凭据变更的调用方在 P2-03 接入。按 4.9/4.10/4.13 定义 default_model_id、验证状态、管理状态与 DTO，P2-02 不实施模型网络调用。

**检查**：重启后配置保持；多个连接只允许一个默认项；非法 URL、重复目录项或不支持的协议报错；默认连接不能被直接删除。

### P2-03 `feat(secrets): store model credentials in database`（已交付）

**结果**：连接凭据作为本地配置写入项目数据库的独立表。

**范围**：实现凭据仓储、写入/清除接口与脱敏状态；严格实现 4.10 的连接锁和单事务更新，凭据与连接修订、目录失效同步提交。删除连接时级联清理关联凭据。数据库文件限制为当前用户读写；此项先提供受理共用锁，P2-11/12 接入 Run 检查。

**检查**：重启后凭据仍可供仓储读取；写入、替换、清除与连接删除均保持事务一致；读取 API 和日志无原文，数据库文件权限为 0600。数据库提交失败时不产生部分更新。

### P2-04A `feat(models): discover and verify explicit model selections`（已交付）

**前置**：P2-02/03。**结果**：真实目录发现、手工模型与按精确 model_id 的能力检查可用。

**范围**：对照 maka-agent 的 connection-model-discovery.ts/model-fetcher.ts，实现 4.9 的 URL 规则、自动发现托管任务、修订/generation 条件落盘、失败保留、manual 来源合并及显式刷新。提供 test/discover-models/manual-models API；检查使用独立有界的非流式 Chat Completions 请求，验证后写 text/tool 状态，不执行 Agent。后续流式适配器复用 HTTP 配置与错误分类，不复用测试提示词。

**检查**：真实端点的精确 ID、空目录、401、响应格式、免密连接、手工模型与 tools 探测；在真实服务请求期间更改端点或并行刷新，旧结果不得覆盖；设置保存成功但发现失败仍返回已保存状态；无测试条件如实标记未完成。

### P2-04B `feat(models): stream explicit provider completion outcomes`（已交付）

**前置**：P2-04A 与 P2-01。**结果**：可区分正常完成、工具批次、截断、取消和异常的 ModelAdapter。

**范围**：对照 DSH llm-pi-ai 的 adapter.ts/stream.ts/catalog.ts，按 4.9 扩展现有 kunyu.agent.runtime.models，落实快照绑定、完整结构化调用、终止结果、显式输出字段/用量参数、可靠推理枚举、超时与取消。不引入 pi-ai，不重试或切协议，不保存隐藏推理。

**检查**：用 uv 临时脚本消费真实文本和工具流；检查终止结果、取消后连接释放、低输出上限触发 length、用量缺失保留 null；记录未能在真实服务触发的错误分支，不宣称已验收。P2-10 再验证 Runner 如何消费这些结果。

### P2-05 模型连接设置页 `feat(settings): manage model connections in existing shell`（已交付）

**结果**：在现有设置 Shell 中交付可使用的模型连接列表页和详情页，完成连接配置闭环。这是模型连接设置页的前端开发项；P2-02、P2-03、P2-04A/B 分别提供连接配置、数据库凭据和模型发现/调用接口，不能代替本项页面。

**入口与文件**：在 `frontend/src/app/router.tsx` 增加 `#/settings/models` 和 `#/settings/models/:connectionId`；在 `frontend/src/features/settings/SettingsSidebar.tsx` 增加“模型”入口；页面和组件放入 `frontend/src/features/settings/models/`，复用 `frontend/src/features/settings/SettingsPage.tsx` 的 `SettingsPageWrapper`、`SettingsPageHeader` 与现有设置 Shell。以 `docs/ui-mockups/settings-model-v3.png` 为页面结构参考。

**范围**：页面只参考 maka-agent 的模型设置，交付“连接列表 → 供应商目录 → 连接表单 → 连接详情”的四层流转。列表展示供应商图标、连接名称、默认模型、默认标记和状态；添加入口提供搜索、推荐/API/聚合/本地分类，以及官方、聚合、本地和自定义 OpenAI-compatible 预设。创建时固定供应商只填写密钥，本地和自定义连接显示必要的名称与端点字段；保存连接和密钥后由后端自动发现模型。

详情页删除旧的多卡片表单、请求参数面板、逐模型检查墙和手工模型入口，只保留凭据、模型、删除三段：密钥与仅允许自定义的端点采用可展开行；模型使用可搜索多选器，保留默认模型、连接测试、主动更新模型列表和设置默认连接；删除时同步处理默认标记。新增闭合 `provider_type`，贯穿 domain/API/SQLite/前端类型，用于稳定展示供应商品牌图标，禁止根据名称或 URL 猜测。旧 `ModelConnectionForm`、`ModelCatalog` 及其独立样式已移除，不保留兼容页面。

**检查**：前端 `npm run build` 通过；后端 `uv run python -m compileall src` 通过；使用 uv 临时数据目录完成 provider_type 的 SQLite 创建、读取和列表往返。正式 UI 仍需用真实 Provider 验收：从供应商目录创建连接、自动发现并主动刷新、启用模型、设置默认模型、完成工具检查、重新进入确认密钥不回显、删除连接，以及窄窗口无溢出。本次未使用内置浏览器，未把构建结果声明为桌面视觉验收。

### P2-06 `feat(runs): persist runs messages and ordered events`（已交付）

**结果**：Run、模型快照、Assistant 和 ToolCall 拥有原子存储能力。

**范围**：先按 4.10/4.11 冻结类型事件和状态转移，扩展 Message、AgentEvent 与 Run/ToolCall/快照表；实现批次工作单元、事件存储适配器、批量 delta 与正文进度、码点 offset。此项只交付仓储能力，不在 API 启动 Run。同步 GET messages 的前端类型与角色/状态最低展示；Reducer 执行入口由 P2-07 接入，不在仓储内另造状态机。P2-06 的提交入口只供仓储手工检查，P2-07 接入 Reducer 后才能用于运行。

**检查**：从新开发库检查约束与顺序；不同 Run 不重置事件序号；提交失败时消息与事件均不残留半条记录；GET messages 能区分部分和完整正文。

### P2-07 `feat(dsh): reduce events into durable run state`（已交付）

**结果**：可由已提交事件确定性恢复运行状态。

**范围**：对照 deepseek-harness `session` 的类型事件与派生投影，实现已冻结事件的 Reducer、状态转移、Tool Call 配对、step/attempt、预算预留/结算与终态保护；持久状态表只是事务内更新的查询投影，不是第二个独立状态机。

**检查**：回放同一事件序列得到相同结果；非法转移报错；中断、取消、完成不会互相覆盖；恢复后预算和工具结果不丢失。

### P2-07A `fix(events): make the event log the sole agent fact source`（已交付）

**结果**：`agent_events` 独立承载完整 Agent 会话与运行事实，所有 Agent 查询投影均可由事件确定性重建。

**范围**：修正 `message.user.appended` 闭合 payload，持久完整用户正文，不再把 `CreateRunProjection.user_message` 作为事件外的事实输入；将 Session 级用户消息投影与已有 Run Reducer 收敛到同一重放路径；`messages`、`runs`、`run_model_snapshots`、`tool_calls` 只能由 Reducer 产生。移除 `agent_events(run_id, session_id) → runs(id, session_id)` 外键及级联删除，`run_id` 仅作为可索引的稳定事实标识，所有权和顺序由闭合事件校验与 Reducer 保证，确保删除 Run 投影不会删除事件。增加内部投影重建服务，按会话事件序列验证连续性并在单个 SQLite 事务内替换投影；无事件正文的现有开发数据通过一次性 Alembic 迁移从同库 `messages` 补入事件，迁移后运行时不保留回查旧投影的兼容路径。P2-09 新增 Confirmation 时必须同步接入该 Reducer/重建契约；WorkspaceMemory 作为已确认业务事实，不在投影重建时重放写入。

**检查**：使用隔离开发库创建独立用户消息和含 Assistant/ToolCall 的 Run；备份后删除 Agent 查询投影、执行全量重建，逐字段确认消息正文/顺序/状态、Run 快照/预算/终态及 ToolCall 参数/结果与重建前一致，`agent_events` 不发生变化；重复重建结果一致；日常提交与重建使用同一 Reducer；重建不调用模型、工具或 WorkspaceMemory 写入。

### P2-08 `feat(agent): add scoped context and local tools`

**结果**：GeoAgent 能读取当前工作空间并提出本地记忆写入。

**范围**：以 P2-07A 已重建的查询投影为读取入口，按 4.11 的完整 step 规则构建模型历史，Context 注入当前会话、地图快照和确认记忆；按 4.13 实现白名单工具、参数 Schema、作用域校验与有界结果；WorkspaceMemory 表与 tool_call_id 唯一约束。写工具此时仅登记，不绕过下一项确认门禁。

**检查**：只读工具返回真实业务数据；跨空间 ID 被拒绝；模型不能指定文件路径、SQL 或 URL 执行；未批准记忆不出现在查询结果中。

### P2-09 `feat(confirmations): authorize exact local write snapshots`

**结果**：本地写入必须通过可恢复的精确确认。

**范围**：PolicyGate 的 L0/L2 决定；持久 Confirmation；查询、批准、拒绝接口；批准后本地写入和执行结果同事务落盘；重复与竞态决定处理，批准事务保存 next_tool_index/ready/resume_phase；先交付续行服务契约，P2-11 绑定调度器，P2-12 开放正式流程。

**检查**：重复批准只写一次；篡改请求参数被拒绝；拒绝无副作用；批准和取消竞态不重复写入，取消先提交则无写入，批准先提交则取消只能停止续行；重启仍能读到原确认。

### P2-10 `feat(dsh): execute bounded model tool loops`

**结果**：Runner 完成模型—只读工具—模型的真实循环，并能等待确认。

**范围**：对照 deepseek-harness `agent-loop/src/agent.ts` 与 `tool-calls.ts` 的模型—工具循环和取消边界，从已提交 run_id 开始执行；组装上下文、处理流、合并 Tool Call、执行工具、应用预算、持久终态；确认时保存完整续行状态，不占用模型连接等待用户。首期工具串行执行，严格使用 4.11 的批次游标和模型历史，正文完成与 Run 完成分开。

**检查**：真实模型可调用 memory_read 后回复；提出记忆写入时暂停；无效工具、调用超限和 Provider 断流有明确失败/中断状态，不生成假成功。

### P2-11 `feat(runs): coordinate scheduling cancellation and recovery`

**结果**：运行生命周期独立于 HTTP 请求和页面生命周期。

**范围**：按 4.12 在 FastAPI lifespan 装配 Agent 组件和进程内调度；会话名额、全局并发/排队、容量预留、锁顺序；启动扫描、显式 resume/cancel、批准后入队；3 秒关闭中断落盘与 Electron 5 秒期限配合；修改/删除未完成 Run 引用的连接时返回冲突。

**检查**：刷新或切换页面不重启 Runner；关闭重启后能辨别完成、确认等待和中断；取消阻止晚到增量；恢复不重复本地写入、不重置预算。

### P2-12 `feat(api): accept idempotent messages with run snapshots`

**结果**：正式消息接口触发 DSH，并提供运行查询与管理保护。

**范围**：替换消息 POST 契约为第 4 节定义；持久幂等记录、原子受理与提交后调度；Run/确认查询；会话模型偏好；归档、移除、永久删除的事务级运行冲突检查。同步更新前端 API 类型、共享输入框的基本模型选择、SessionMessagesProvider 的请求/响应处理和 CORS 请求头；同项交付未决请求 key/正文冻结、原始 SSE 分发、最小 Assistant 持久正文/角色/终态展示、发送禁用与基本停止/恢复/确认按钮（确认前必须展示完整参数、范围及副作用）。delta 缓存合并正确性按 4.11 在本项交付，P2-13 完善流式展示体验，精确确认卡片样式由 P2-14 完善；不能出现已受理但没有可操作运行状态的页面。

**检查**：用户/Assistant 正确区分，精确确认和取消可从最小界面完成，原始事件与消息缓存同步；同 key 重试返回同一 Run；不同正文冲突；模型/上下文校验失败不追加用户消息；进程在提交后入队前退出不会丢失已受理 Run；已有归档和恢复语义不变。

### P2-13 `feat(conversation): select models and render assistant streams`

**结果**：从共享输入框发起真实运行并展示持久回复。

**范围**：完善上一项基本接线的连接/模型/推理强度选择与错误反馈；运行快照与地图上下文展示；完善已有未决请求/草稿的交互；完善 Assistant 部分状态与运行入口；按 4.11 用码点 offset、updated_sequence 合并快照和增量，覆盖 emoji、旧快照晚返回和新 attempt。

**检查**：无可用连接时显示明确配置入口；消息提交失败保留草稿和重试 key；对话、轨迹、地图切换不丢模型选择；重启恢复持久正文且不重复字句。

### P2-14 `feat(conversation): display confirmations and interrupted runs`

**结果**：用户可以批准精确操作、拒绝、取消或恢复运行。

**范围**：完善 P2-12 的基本运行操作为对话内确认卡片、执行范围/参数/副作用、提交中状态；Run 查询与 SSE 共用缓存；中断说明、恢复和取消按钮；归档/移除冲突提示。沿用 shadcn/ui，不新增全局阻塞弹窗流程。

**检查**：重复点击不重复写入；重启后的确认可继续处理；切换页面不丢待确认状态；终态 Run 没有可误触的恢复按钮。

### P2-15 `feat(trajectory): project real model tool and confirmation events`

**结果**：现有轨迹能解释真实运行过程。

**范围**：消费 P2-12 已分发的原始事件，扩展现有 projection、model、ledger、inspector 与 timeline 输入；正确关联用户、Assistant、工具和确认；对话仅显示关键活动；真实开始/结束时间驱动耗时。保留现有时间线组件，不为本阶段做大规模拆分。

**检查**：工具参数和结果脱敏；时间线、记录表、详情指向同一对象；缺失用量/耗时为空；SSE 重连不重复记录；未知事件明确显示不支持。

### P2-16 `feat(scenes): validate built-in geoskill packages`

**结果**：内置场景是可校验的版本契约。

**范围**：按 4.14 的最小 Schema 加载 manifest、SKILL、workflow、validation、presentation；分开报告结构有效性与外部依赖可用性；Scene DTO、列表和详情 API。洪涝场景只记录真实可确认的输入输出与规则，未完成的 OGE 服务绑定明确缺失。

**检查**：缺字段和无效包有明确错误；缺少 OGE 不标记为可执行，不填假 service_id；有效包仍能只读查看；场景文本不能改变 Tool 白名单和权限。

### P2-17 `feat(geoskills): browse versions and attach session context`

**结果**：用户可查看场景并为会话指定版本上下文。

**范围**：GeoSkill 只读目录与详情；会话 scene_id/version；scene.get 与 Context 精简场景约束；在受理事务和 Run DTO 中同步加入 scene_id/version/精简约束快照；scene.get 只读快照，不按可变安装目录重建。依赖缺失时仅允许查看/作为讨论上下文，正式“开始分析”不可用。

**检查**：既有 Run 不随会话更换场景而变化；未完成 Run 期间不能换版本；界面不会把普通会话创建说成正式 OGE Task；Agent 不能发布或修改场景。

### P2-18 `docs: verify and record phase two delivery`

**结果**：形成真实可复现的阶段二交付记录。

**范围**：按第 2.1 节行为对齐表、有意差异表和第 6 节完成手工验收，逐项记录参考实现的输入/结果、本项目的输入/结果、平台、Provider/模型、已通过项、差异和未覆盖项；非预期差异未修正不得标为对齐；有意差异按本文验收。更新架构文档与阶段状态。只记录实际执行结果。

**检查**：全部必须项完成才能标记阶段二已完成；没有凭据或真实模型验证条件时保留未完成状态，不用模拟回复替代。

每个 commit 正文使用以下四项：`Reference`（实际路径与源行为）、`Change`（本项目落点与有意差异）、`Validation`（执行命令/手工输入和观察结果）、`Remaining`（本项未验证内容和明确归属的后续编号）。不得将计划中的检查写成通过；没有待办时 Remaining 写 none。

## 6. 阶段验收

### 6.1 工程检查

- uv sync --project backend
- uv build --project backend，并检查构建产物只发布 kunyu，包含 agent/runtime、agent/tools 和提示词资源。
- uv run --project backend python -c "import kunyu; import kunyu.agent.runtime"
- npm run typecheck --prefix frontend
- npm run build --prefix frontend
- npm run typecheck --prefix electron
- git diff --check

### 6.2 桌面主链

1. 使用独立开发数据目录启动 Electron，确认仍由桌面拉起后端。
2. 在模型设置从供应商目录搜索并选择一个真实 Provider，确认品牌图标、预设端点和精简连接表单正确；保存凭据后自动发现真实模型 ID，在详情页启用模型、设置默认模型并完成工具检查，再主动更新一次目录，核对启用选择与失败状态。
3. 创建工作空间与会话，在对话输入框选择连接和模型，发送普通消息。
4. 确认用户消息与 Run 只创建一次，Assistant 实际流式输出，完成后重启仍可读取。
5. 发起需要 memory_read 的请求，核对空查询列出的真实记忆与后续回复。
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
- 除 `ModelCredential` 表外，检查数据库其它表、API 响应、SSE 与日志中没有模型密钥、桌面 token 或隐藏推理。

- 幂等响应丢失后，待 Run 完成再归档或删除原连接，同 key/正文仍返回原记录；改变正文仍为 409。
- 目录发现/模型检查期间修改配置，以及同修订并发刷新：旧结果不覆盖新结果；保存成功、发现失败在 UI 中分别呈现。
- 凭据写入、替换、清除和连接删除在事务提交前退出不产生部分更新；提交后重启结果完整一致；数据库不可写时明确失败。
- 备份隔离数据库后删除 `messages`、`runs`、`run_model_snapshots` 和 `tool_calls` 投影，只依据 `agent_events` 重建；重建前后 REST 消息、Run 状态、快照、预算和工具记录逐字段一致，重复重建不改变结果，且不产生任何业务副作用。
- 一个模型 step 含“只读—确认写入—只读”三项：第二项等待时重启，批准只推进一次；批准事务提交后入队前退出也不重做写入。拒绝/取消后新 Run 的历史不含未配对工具批次。
- 文本检查成功但工具检查未通过的模型不能创建 GeoAgent Run；能力 unknown 不发送 reasoning_effort；免密服务无需伪造 key。
- emoji/组合字符正文、重叠增量、缺口、旧 REST 快照晚返回、新 attempt 均不重复、不回退；流缺 finish_reason、length 和空正常输出不能显示完成。
- 全局 4 个执行与 32 个排队额度用临时降低配置值进行手工验证并恢复默认；等待确认释放执行名额，容量满时批准不写记忆；累计预算跨恢复不重置。
- 正常关闭时待确认保留原状态；活跃 SSE 不使 Runner 清理被无限推迟；超过关闭期限后启动扫描仍能识别未完成 Run。
- 场景包缺文件、重复版本、依赖环、未知输出引用分别报错；依赖缺失仍可讨论，既有 Run 读取冻结文本。

以上均为开发完成后应执行的验收，不是本计划已经通过的结果；本阶段默认不新增自动化测试文件。

## 7. 完成定义与阶段三交接

阶段二只有在真实模型、真实本地工具、确认写入和同库重启恢复全部通过后才完成。预期链路为：

```text
共享输入框 + ModelSelection + MapContext + Idempotency-Key
  → 应用服务原子追加完整创建事件
  → Reducer 在同一事务生成 User Message / Run / 模型快照查询投影
  → DSH Context → Model → Tool / Confirmation → Model
  → 追加有序事件并同事务更新 Assistant / ToolCall / RunState 查询投影
  → REST 快照 + SSE → 对话 / 轨迹 / 运行操作
```

交给阶段三的稳定接口为 ModelAdapter、ToolRegistry、PolicyGate、EventStore、确认快照和 Run 恢复机制。阶段三再加入 OGE Profile、Task/RemoteJob、waiting_external、processId 监督与 Artifact，不重新实现模型设置或会话基础设施。
