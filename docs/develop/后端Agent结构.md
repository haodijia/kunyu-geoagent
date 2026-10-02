# 后端 Agent 结构

Agent 架构必须对齐本地 `deepseek-harness` 源码的服务、插件、作用域、生命周期和持久会话边界。Python 实现保留单一 `kunyu` 包；包名不影响这些机制。`bootstrap.py` 选择组合，插件通过声明依赖构造服务，运行时通过 Context 取得服务。

## 源码对应

参考根目录：`/Users/dijkstra/project/02-ts/deepseek-harness`。

| deepseek-harness | 坤舆实现 | 对齐内容 |
| --- | --- | --- |
| Cordis 服务定义与插件组合、`packages/bundle/base` | `agent/kernel.py`、`services.py`、`bootstrap.py`、`plugins/` | 服务定义与实现分离，依赖顺序安装，重复提供者和缺失依赖报错，失败回滚，提供者卸载释放依赖者 |
| `core/scope/src/index.ts`、`store.ts` | `agent/scope.py` | 作用域向下继承；同名注册由近层覆盖；注册与 effect 归属提供者；关闭等待清理，汇总清理错误 |
| `core/agent/src/index.ts`、`core/agent-loop/src/index.ts` | `session_agent.py`、`plugins/loop.py`、`scheduler.py`、`runtime/driver.py` | Agent 注册表与具体驱动分开；每个会话有独立 Context；每次执行有子作用域；卸载先取消、等待执行退出，再释放资源 |
| `core/agent/src/dispatch.ts`、`runtime-types.ts`、`core/agent-loop/src/agent.ts` | `hooks.py`、`notifications.py`、`runtime/hooks.py`、`runner.py`、`runner_model.py` | 带作用域的控制边界、状态/输入/助手流/错误通知与同一步重试 |
| `llm/llm/src/retry-policy.ts`、`llm/llm-retry/src/index.ts` | `runtime/retry_policy.py`、`agent/retry.py` | Provider 持有策略，配置为空的插件执行持久退避，按步骤／路由／完整策略续接计数 |
| `core/session` | `runtime/events.py`、`session_reducer.py`、`persistence/` | 追加日志为事实源，确定性重放得到查询投影 |
| `core/system-prompt` | `runtime/context.py`、`plugins/core.py`、`prompts/system.md` | 有序、带作用域的提示词段注册；指令正文由用户维护 |
| `core/tools` | `runtime/tools.py`、`runner_tools.py`、`tools/registry.py` | 工具注册与实现分开；模型 Schema 来自实际注册；有界并行/独占调度；风险策略与确认接缝 |
| `packages/context` | `agent/context.py`、`persistence/agent_context.py` | 注入正文成为有顺序的持久会话内容，后续步骤及轮次按原位置重放 |
| `skill/skill`、`skill/skill-filesystem`、`skill/tool-skill` | `skills/registry.py`、`filesystem.py`、`context.py`、`tools/skills.py` | 注册表、来源、调用工具分开；目录仅注入名称和简介；选择后加载正文；区分模型/用户调用权限；持久目录替换与显式用户调用 |

这是 Python 的对应实现，没有引入 Cordis 的 TypeScript 运行时。尚未实现参考项目的完整助手流记录、surface 替换/压缩、PTC、多 Agent 委派、profile 配置装载及插件市场，不能宣称完整功能等价。中断恢复仍采用本项目的显式恢复与持久确认契约。

## 目录与运行链路

```text
backend/src/kunyu/agent/
├── bootstrap.py          # 产品组合：选择模型、循环与扩展插件
├── kernel.py             # 插件契约、依赖安装、发布、卸载、回滚
├── scope.py              # Context、服务继承、作用域注册与资源归属
├── services.py           # 类型化服务标识
├── plugins/
│   ├── infrastructure.py # SQLite 事件/仓储与模型提供者
│   ├── core.py           # 作用域、提示词、工具、确认与轮次服务
│   ├── memory.py         # 两个记忆工具的贡献插件
│   └── loop.py           # 默认驱动提供者与每次执行的 Runner 插件
├── session_agent.py      # 对外 Agent API、注册表与会话 Context
├── inbox.py              # 持久 next-step/next-turn 输入、领取与丢弃
├── scheduler.py          # 队列、并发、取消、恢复
├── adapters.py           # 已提交 Run、凭据和确认适配
├── context.py            # 模型可见历史与上下文组装
├── hooks.py              # 会话 Agent 融合调用、作用域中间件与通知注册
├── notifications.py      # 非否决状态、输入及助手流通知
├── retry.py              # Provider 策略执行、持久退避与取消排空
├── commands/             # 作用域命令注册、计划/权限、压缩和执行日志
├── prompts/system.md     # 用户维护的系统指令
├── runtime/              # 模型/工具契约、循环、类型事件、Reducer
├── tools/
│   ├── memory.py         # 记忆 Schema、描述、执行和确认事务处理器
│   ├── registry.py       # 作用域工具贡献、写处理器与风险策略
│   └── shared.py         # 参数、归属与结果校验
└── skills/
    ├── registry.py       # 分层 SkillProvider、目录和按需正文读取
    ├── filesystem.py     # 本地发现、YAML 校验和文本资源读取
    ├── context.py        # 持久目录替换和 /技能名 注入
    ├── render.py         # 模型目录、资源指引和正文格式
    ├── plugin.py         # Skill 服务、文件系统来源和工具消费插件
    └── bundled/          # 随应用提供的 SKILL.md 与资源
```

运行链路：API → SessionAgent → Scheduler → 插件提供的 AgentRuntime → 会话子作用域 → Runner 插件 → 模型/工具 → 事件存储。Runner 在执行作用域内解析真实模型、提示词、工具和确认服务，完成或取消后释放子作用域。会话扩展通过 `SessionAgent.ctx` 注册，跨会话隔离；`AgentDirectory.dispose()` 取消该会话未完成工作后释放注册。

内核安装前校验依赖图。安装失败时撤销已经贡献的服务、工具与 effect；卸载提供者时先释放依赖它的插件/执行作用域。关闭进程先阻止受理，再停止后台发现和取消执行，等待退出后释放 Agent 作用域、HTTP client 与数据库。异步清理失败会报告，其他资源仍执行清理。

`runtime/` 不依赖 FastAPI、SQLAlchemy、业务工具或模型网络实现。业务仍按 api/application/domain/persistence/integrations 分层。

## 循环控制与重试

`AgentHooksPlugin` 提供 `HOOKS` 服务。插件用 `hooks.pre_step/request/request_error/turn_stopping/errors.register(owner, name, handler)` 注册贡献，最近作用域的同名处理器覆盖祖先处理器，兄弟会话互不影响，owner 释放时移除。每次调用携带实际 `SessionAgent`、已提交 Run 和取消信号，不创建另一份 Agent 代理。

`pre_step`、`request` 和 `request_error` 是串联中间件，`next()` 最多调用一次。`pre_step` 可以替换本步输入、拒绝步骤或移除初始输入；决定作为 `agent/step/decision` 保存。拒绝或空初始步骤不消耗模型调用。输入从首次 `request.header` 提交起进入已接纳历史，取消于请求之前的输入及技能正文不会进入后续模型请求。

`request` 在每次尝试前选择完整调用配置；日志保存实际配置，Run 受理时的初始模型选择保持独立。`request_error` 在失败尝试和助手消息结算后选择同一步重试，或交给默认终止行为。重试追加 `run.retried`，递增 attempt，保留 step 和本步已组装上下文，不重新领取输入或重复加载技能；仍受总调用、输出和活动时间预算约束。

`RetryPlugin` 是无配置的 `request_error` 扩展，策略属于模型连接并冻结在受理、队列与实际请求事件快照中。normal 默认重试 5 次，初始 500ms、上限 10s、抖动 0.1；只处理空回复、限流、服务器故障、超时和网络错误。不可重试错误、次数耗尽或供应商建议等待超过策略上限时交给后续处理器。always 先等待后续恢复，后续选择重试时直接采用；后续报错会记录并继续按本策略恢复。always 没有策略次数上限，但 Run 的总调用预算仍生效。

退避按步骤、实际连接路由和完整规范化策略键计数，策略键为有序 JSON，不添加 hash；同一组复用 retry_id，新步骤及不同路由／策略另起计数。`llm/retry` 先提交计划，再可取消等待，等待完成后提交 `llm/retry-started` 才返回重试决定。停止或插件释放不会补写 start 或继续请求；释放等待已进入的后续处理器结算，取消优先于其恢复决定。中断后显式恢复保留已提交计数，未完成的等待不会在后台自动重放。Reducer 拒绝尚未结算的失败、伪造路由／策略、重复计划和无计划的 start。

适配器仍只发单次 HTTP 请求，429、5xx、超时与网络失败提供稳定错误类别；正数秒或 HTTP-date 的 `Retry-After` 转成等待建议，无效值不参与策略计算。设置页复用 Mu 的详情行编辑策略，修改不会撤销模型目录验证，活动 Run 或待发送输入占用连接时拒绝修改。对话显示真实计划的倒计时，轨迹保存计划／启动事件，不把退避日志混入模型历史。

`turn_stopping` 在助手结算后按序执行同步或异步处理器，随后重新读取下一步队列；处理器通过实际 Agent 追加引导时继续当前 Run。控制处理器的异常会记录并结束 Run；即使处理器吞掉取消异常，取消信号也会阻止继续调用模型。`errors` 是不影响控制决定的通知，单个同步/异步观察者报错独立记录；异步通知由注册 owner 持有，关闭时取消并等待退出。

主循环、模型执行和模型尝试结算分别放在 `runtime/runner.py`、`runner_model.py` 和 `model_attempt.py`，工具执行继续由 `runner_tools.py` 负责。

`hooks.status/inbox_inserted/inbox_claimed/inbox_discarded/assistant_stream.register(owner, name, handler)` 提供参考项目的五类非否决通知。所有通知绑定实际 SessionAgent 和其作用域，最近同名贡献覆盖祖先，兄弟会话隔离。同步异常与异步拒绝分别记录，后续观察者继续执行；异步任务由注册 owner 持有，释放时取消并等待结束。输入通知为每个观察者复制内容/地图/轮次快照，助手帧及工具参数为不可变快照，观察者不能改写模型输出或其他观察者的输入。

`SessionAgent.status` 仅表示实际驱动的 `idle/running`，进入可取消执行时切换为 running，驱动及其执行作用域排空后切换为 idle，不对重复状态发通知。确认等待和显式中断停止本次驱动后为 idle，具体 Run 状态继续由持久事件查询。作用域关闭时，本地已释放观察者不再调用，仍存活的全局观察者可以收到最后的取消结算与 idle。

`persistence/event_publications.py` 在最外层事务提交后发布事件批次；保存点提交只合并等待发布内容，保存点回滚仅丢弃所属内容，外层回滚不发布。重入提交按批次顺序发布。输入通知按真实 splice 的插入、领取或丢弃身份生成，幂等受理不重复通知，历史重放不发送新通知。

助手流按 start → chunk → end 发布。每个 SessionAgent 生命周期内 revision 严格递增，chunk index 从零连续编号，end index 为块数量；chunk 携带毫秒时间及真实文本、推理、完整工具调用、用量或结束结果。end 的 committed 指向已经提交的 `model.attempt.finished` 序号和真实结果，取消也先结算；结算事务失败则发 abandoned。新 Agent 生命周期重新计数，不重放旧帧。当前前端仍读取既有持久 delta 事件，原始 chunk 帧只用于进程内扩展；参考项目的完整紧凑助手流持久记录仍待对齐。

## 扩展 Tool

同类工具放一个功能文件；变大后再拆同名目录。工具自带 Schema、描述、风险级别、执行方式和校验。

1. 在 `agent/tools/<功能>.py` 实现工具。
2. 在贡献插件中声明 `requires`，从 Context 获取服务或仓储。
3. 调用 `TOOLS.register(owner, name, ToolRegistration(builder, write_handler))`，贡献随 owner 释放。
4. 在产品组合的 `plugins` 参数中启用插件；会话专属扩展通过 `install_plugin(agent.ctx, plugin)` 安装。

默认启用 `MemoryToolsPlugin` 的 `memory_read`、`memory_write`，以及 `SkillToolsPlugin` 的 `skill`、`skill_resource`。模型提供者和循环提供者可分别通过 `model_plugin`、`loop_plugin` 显式替换。没有旧路径、静态插件包装或工具名分支兼容层。

L0 工具可直接执行；L2 本地写入必须注册同名事务处理器。确认服务保留精确参数快照，批准后调用处理器；业务修改、确认和工具结果同一事务提交，失败一起回滚。远程业务应另建持久作业与监督流程。

工具批次按 deepseek-harness 的屏障与并发池执行：连续的 L0 并行工具最多同时运行四个，独占工具等池排空后执行。开始事实先持久提交，再调用工具；结果按模型发出的顺序提交。批次预留工具次数与活动时间，结束时按实际用量结算；取消会停止补充任务、等待已启动任务退出，并将未完成调用标记为取消。恢复重新执行安全的只读调用，保留已经结算的结果。

模型提供的参数在调用事件中原样保存，校验在执行边界进行。未知工具、参数错误、权限拒绝、资源不存在和执行超时均记录真实 `tool.failed` 结果，后续模型请求可以读取错误并修正；这些结果不会直接终止 Run。协议错误、预算耗尽和持久化错误仍结束运行。完整的工具批次包括已完成与已失败调用，不包括仍在运行或等待执行的调用。

## 扩展 Skill

默认组合分别启用 `SkillPlugin`、`FilesystemSkillsPlugin` 和 `SkillToolsPlugin`。`SkillRegistry` 支持作用域 Provider 注册、元数据目录、模型/用户调用限制，以及显式读取正文。同名技能由最近作用域优先；同层按来源 rank 决定。来源报错和不匹配的正文直接报错并记录日志。

来源实现放 `agent/skills/`，模型调用工具放 `agent/tools/skills.py`，内置指令放 `agent/skills/bundled/<name>/SKILL.md` 与相邻资源。用户技能保存在应用数据目录的 `skills/`，工作区技能保存在 `workspaces/<workspace_id>/skills/`，也会发现 `~/.agents/skills`。

`ContextPreparationRegistry` 在每次模型步骤组装历史前运行带作用域的异步贡献。技能消费者重新发现目录，比较实际名称和简介列表；变化时追加 `context.injected` 完整替换，全部移除时记录空目录，不计算文件 hash。目录事件携带 `producer=skill-catalog` 和实际条目。`/技能名` 解析 pre-step 接纳的消息，支持处理器改写后的输入，每条消息按用户权限加载一次；正文、来源、消息身份、Run 和 step 以 `producer=skill-invocation` 持久保存。正文只在所属步骤实际发送后进入后续历史。恢复同一 Run 时重放原文，不随文件编辑重写历史。

模型使用 `skill({name})` 加载正文，实际结果进入已有工具完成事件；`skill_resource({name,path})` 按需读取技能目录内的 UTF-8 资源。用户专用技能的资源仅在当前 Run 显式调用后开放。资源不允许绝对路径或越界符号链接，不执行脚本、不安装依赖。详细使用、格式、来源和接口见[Agent 技能](Agent技能.md)。远程来源、文件 watcher、插件市场和脚本执行尚未实现。

GeoSkill 的版本化地理场景逻辑放 `kunyu/scenes/`，场景数据放 `backend/scenarios/`。Tool 是执行能力，Skill 是任务指令和资源，GeoSkill 是业务场景契约。

## 上下文与历史

当前请求顺序：系统指令 → 当前 Run 冻结的工作空间/地图信息 → 按事件序号排列的会话历史（用户消息、注入内容、助手消息、工具调用及结果）。记忆不自动注入。

已接纳的注入内容不会在一次请求后消失。已完成工具结果保留原值；失败/取消结果保留提交状态与错误字段。助手被中断或取消时保留已经提交的文本和推理内容；失败尝试的输出保留在日志和界面，但不回传给模型。尚未闭合的工具批次不构造缺失的结果，不发送不配对的 tool 消息；显式恢复后再重放已闭合批次。`/compact` 在 Agent 空闲时生成并持久化模型摘要，后续请求使用摘要与边界之后的历史。

对话页面与轨迹页面读取同一事件日志。对话的思考正文、开始/结束时间、工具运行时间均从实际事件派生；刷新后可还原。只有当前模型尝试的推理显示实时状态，已中断或取消的历史不会继续计时。

## 运行中引导

`SessionAgent.inbox` 从会话的 `agent/inbox/spliced` 日志重放 next-step 和 next-turn 两条队列。运行中发送 `steer` 保持当前 Run、模型快照和预算，不取消模型流或工具执行。受理事务持久保存消息、地图快照和幂等身份；重复请求返回同一消息。最多等待 32 条引导输入。

进入新模型步骤时，ContextProvider 先持久领取等待输入，再运行 pre-step 和技能等上下文贡献。领取步骤、丢弃状态和用户消息均可重放；未领取、未发送或已丢弃输入不进入后续模型历史。恢复/重试已接纳步骤时复用决定，不领取新输入；中断期间追加的引导留到下一步。当前模型以普通 stop 结束但仍有等待输入时，先结算助手消息，再在同一个 Run 中开启新步骤。显式取消或终态失败丢弃尚未领取的输入，中断则保留它们供恢复领取。

`followup` 进入 next-turn 队列，保存未来轮次身份、模型快照、预算和调度顺序，但等待期间不创建 Run，也不进入模型历史。会话空闲时，调度器在同一数据库事务内领取首条输入并追加用户消息与 Run 事实；前一轮等待确认或恢复时，后续输入保持排队。每个会话最多一个未完成 Run，不同会话最多并发四个；全局待调度 Run 与输入总计最多 32 条。后端重启重新读取队列，执行中的 Run 中断后按显式恢复契约继续。

前端展示已受理的引导消息及“等待下一步处理”状态，领取事件到达后清除等待标记。“添加到队列”使用 `delivery=queue` 保存独立后续问题，也支持显式技能消息；待发送面板置于输入框上方，按 mu 的宽度、圆角、行距、图标和菜单展示，支持自动/手动发送、指针/键盘排序、立即发送、删除、清空确认和移回输入框编辑。窄窗口采用整行长按拖动。直接发送在运行中仍使用下一步引导。待发送输入通过 `DELETE /agent/inbox/{message_id}` 丢弃，已领取身份返回明确冲突；编辑仅在输入框为空时执行，期间锁定输入框，完成后自动聚焦，避免覆盖草稿。

`agent/queue/mode` 持久保存自动/手动模式，`agent/queue/reordered` 保存完整顺序，`agent/queue/dispatched` 标记显式发送。调度器在领取事务中重新检查模式；手动队列不会自动执行，重启后继续保留。空闲会话的普通 `followup` 可以直接发送而不启动其余手动草稿。`PATCH /agent/queue` 修改模式或完整顺序，重复/缺失身份或并发领取返回明确冲突。筛选可发送会话后才应用调度数量限制，手动队列不会占用其他会话的调度名额。

`POST /agent/inbox/{message_id}/send` 对齐 mu 的“停止当前回复后优先发送”：在调度锁内将所选输入移到首位、切换自动模式并取消活动尝试，等待当前执行退出及取消事实提交后再领取所选输入；其余待发送输入不丢弃。`POST /agent/queue/clear` 在单个事务内丢弃全部草稿。显式停止和会话 Agent 释放清空等待输入，正常结束在自动模式下领取下一条。队列非空时禁止归档会话、移除工作区或更改关联模型连接。

受理响应的 `turn` 在输入等待领取时为 null，领取后查询返回真实轮次；不创建占位 Run。消息投影可保存用户输入的取消状态。开发迁移 `0003` 明确历史 inbox 的 target 并更新消息约束，SQLite 表重建期间关闭外键级联，提交前检查完整性。最终数据库仍待开发结束统一整理 SQL。

迁移 `0004` 为既有请求日志补齐实际模型配置，为显式技能注入补齐步骤归属；旧日志通过重放验证，不保留运行时兼容分支。

草稿箱拖动开始通过 `POST /agent/queue/interactions/{interaction_id}` 暂停当前会话的下一轮输入领取；受理前核对完整顺序，排序提交后才释放暂停。`QueueInteractionConfig` 默认租约 30 秒、每会话最多八个交互，前端每三分之一租期续租。租约到期、交互取消、组件卸载或会话作用域释放均解除暂停并唤醒调度；暂停会话在并发名额筛选前被排除，不阻塞其他会话。交互状态属于作用域资源，不写入模型历史或持久队列日志；已领取的运行继续执行。队列在受理或排序期间变化时明确返回冲突。

`POST /agent/inbox/{message_id}/edit` 在调度锁内原子移出等待输入，返回原内容、完整地图上下文与未来轮次模型快照；前端一次恢复三个状态并聚焦。编辑中的普通消息及显式技能保留后续轮次语义，运行中再次发送不会改为当前轮引导；已有草稿与未决提交禁止覆盖。队列路由集中在 `api/agent_queue.py`，共享作用域依赖集中在 `api/agent_dependencies.py`。

附件/跨会话引用、完整助手流持久记录、PTC 与多 Agent 委派仍是后续对齐项。

系统指令和两个工具的描述未在本次架构改动中修改；维护入口见[记忆工具与上下文](记忆工具与上下文.md)。

## 验证

临时数据库副本通过插件组合的真实运行链路完成读取、确认、原子写入和继续回复；故意让事件提交失败时业务写入回滚，重复批准只写一次。下一轮保留注入正文与原工具结果。另核对依赖顺序/回滚、会话注册隔离、提供者卸载、活动执行取消和资源释放。

并发探针验证并行池上限、独占屏障、结果顺序、可修正工具错误及取消排空。持久引导验证一个 Run 内三次模型请求：流式响应期间受理输入，第 2 步领取并加载显式技能，执行真实记忆读取后完成；重复受理返回原消息。离屏 Electron 使用临时数据库验证浅色、深色及窄窗口的对话、思考、工具、表格和代码块展示，无横向溢出。

双队列验证三个有效输入串行完成三个 Run、四次模型请求，同会话并发上限为一；未领取输入不泄露到模型历史，删除的输入从未送入模型。关闭并重建完整插件组合后，等待输入和引导输入继续保留，显式恢复后顺序完成。旧预览数据库升级并重建投影，原 Run 与两个工具记录完整保留，外键检查无错误。离屏 Electron 验证待发送面板及实际删除 API，计数从二变为一。

控制边界探针验证消息改写、实际请求路由变更、同一步失败重试、结束前引导继续、拒绝/空步骤零调用，以及释放会话作用域后注册不复用。取消探针验证吞掉取消异常仍终止，未发送输入及技能正文不进入下一轮。错误通知探针验证同步/异步观察者报错不否决主流程、兄弟作用域隔离、owner 释放排空异步通知。新的恢复边界验证三个 Run、五次请求：中断尝试及恢复保持同一步，引导另开下一步，随后串行处理两个后续问题。旧预览数据库升级至 `0004` 后原 Run、两个工具与请求模型快照完整保留。

草稿箱探针通过真实 Agent 与 ASGI API 验证手动模式/排序重启保留、过期排序返回 409、普通发送不触发手动草稿、立即发送取消活动回复且优先执行目标、保留其余队列、原子清空和单会话模型并发上限一。离屏 Electron 验证浅色、深色、600px 窗口、实际键盘排序 API、清空确认取消、编辑后草稿/焦点还原与已有草稿保护；桌面面板和输入框宽度均为 800px，窄窗口均为 576px，无横向溢出。

交互探针验证拖动暂停自动领取、其他会话继续运行、排序提交后释放、续租、超时恢复、作用域释放以及重复编辑冲突。离屏 Electron 通过真实键盘拖动验证请求顺序为暂停、排序、释放；编辑后原模型、高推理参数、地图视口、输入框焦点与后续发送标记全部还原，重新入队的请求携带完整原快照。浅色桌面和深色窄窗口无横向溢出、无渲染错误。

通知探针验证同步/异步观察者失败不否决、会话隔离、幂等输入不重复、输入快照隔离、连续助手帧、已提交结束序号、取消结算和 owner 释放排空。关闭活动会话与卸载循环插件仍发布实际已提交的最后结算；新生命周期重置 revision。保存点/外层回滚和重入顺序探针通过，结算写入失败明确发布 abandoned，所有模型输出类型及不可变工具参数通过验证。原引导/后续轮次、重启恢复、队列交互及控制取消探针继续通过，同步 turn-stopping 处理器通过。

Provider 重试探针通过 normal 次数/错误筛选、指数退避、空回复恢复、Retry-After、always 后续决定/异常、总调用预算、同一步 Skill 仅加载一次、停止等待、重启计数、路由/策略隔离、伪造与重复事件拒绝、释放等待及后续处理器排空。实际 ASGI 接口验证策略保存、无效参数、草稿占用锁及目录验证不变，修复连接占用查询的错误 join。0004 预览库升级至 0005 并重建投影，原运行/消息/队列数量不变，嵌套队列策略快照完整。离屏 Electron 使用本地真实 HTTP 429 供应商验证倒计时递减、轨迹计划、停止清除、策略保存、无效参数禁用保存、浅色桌面及深色窄窗口，无横向溢出和渲染错误。

`ruff check`、`compileall`、后端模块导入及 `uv build` 通过；全新临时数据库的 FastAPI lifespan 启动和关闭通过。

验证使用临时脚本与临时数据库，不请求真实模型，不修改用户数据库，不新增测试文件。开发数据库迁移随功能提交。

## 会话命令与推理参数

`CommandsPlugin` 提供作用域 `COMMANDS` 服务；定义由插件贡献，会话子作用域可以安装专属命令。API 发现当前会话定义并合并可由用户调用的 Skill；前端仅贡献 `/model` 选择面板。执行持久化 `command/run`、`command/done`，相同请求身份返回同一结果。命令结果属于会话控制记录，不自动变为用户消息；只有 `/plan <需求>` 明确受理模型轮次。

计划、权限和压缩状态来自持久事件。每个模型步骤重新读取计划提示词；写工具策略及批准路径重新检查当前权限。压缩保留原始事件，以摘要和边界替换后续模型历史。`/goal` 尚无目标状态和自主续跑服务，不注册占位命令。

推理档位及默认值来自模型列表元数据，经过目录、持久记录和 API 传到选择面板。DeepSeek 的 `off` 在适配器映射为关闭思考；其余档位按原生值发送。流式思考独立保存为 `message.assistant.reasoning.delta`，与正文共用输出预算；携带工具的请求回传历史思考。
