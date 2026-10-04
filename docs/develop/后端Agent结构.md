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
| `llm/llm/src/assistant-stream.ts`、`core/agent-loop/src/assistant-stream.ts` | `runtime/assistant_stream.py`、`model_attempt.py` | 一次捕获模型分块与时间，紧凑保存文本／思考／工具碎片，结算后发布已提交结束帧 |
| `llm/llm/src/types.ts`、`assembler.ts` | `runtime/content.py`、`block_assembler.py`、`models.py` | 文本／思考／工具内容块，按首次出现组装，安全中断与按块对齐的不可变 ReplayEnvelope |
| `api/session-controller/src/history.ts`、`assistant-stream.ts`、`client/sessions/assistant-stream.ts` | `api/session_follow.py`、`notifications.py`、前端 `events/live-assistant.ts` | 统一 opening、连续持久事件、cursorless 原始帧与精确重连前缀；结算替换暂态 |
| `core/session` | `runtime/events.py`、`session_reducer.py`、`persistence/` | 追加日志为事实源，确定性重放得到查询投影 |
| `core/system-prompt` | `runtime/context.py`、`plugins/core.py`、`prompts/system.md` | 有序、带作用域的提示词段注册；指令正文由用户维护 |
| `core/tools` | `runtime/tools.py`、`runner_tools.py`、`tools/registry.py` | 工具注册与实现分开；模型 Schema 来自实际注册；有界并行/独占调度；风险策略与确认接缝 |
| `packages/context` | `agent/context.py`、`persistence/agent_context.py` | 注入正文成为有顺序的持久会话内容，后续步骤及轮次按原位置重放 |
| `skill/skill`、`skill/skill-filesystem`、`skill/tool-skill` | `skills/registry.py`、`filesystem.py`、`context.py`、`tools/skills.py` | 注册表、来源、调用工具分开；目录仅注入名称和简介；选择后加载正文；区分模型/用户调用权限；持久目录替换与显式用户调用 |
| `packages/fs/fs`、`fs-local`、`fs-observation-policy`、`tool-fs` | `domain/filesystem.py`、`integrations/filesystem.py`、`filesystem_io.py`、`agent/filesystem.py`、`plugins/filesystem.py`、文件工具 | 文件系统与观察策略分开；路径作用域、版本守卫、原子发布、行窗口与应用结果 diff |

这是 Python 的对应实现，没有引入 Cordis 的 TypeScript 运行时。已实现文本／思考／工具内容块、图片／文件输入、图文工具结果与 replay 核心；仍未实现 surface 替换/压缩、PTC、多 Agent 委派、profile 配置装载及插件市场，不能宣称完整功能等价。中断恢复仍采用本项目的显式恢复与持久确认契约。

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
│   ├── filesystem.py     # 文件系统提供者、观察策略与 read/write/edit 工具贡献
│   └── loop.py           # 默认驱动提供者与每次执行的 Runner 插件
├── session_agent.py      # 对外 Agent API、注册表与会话 Context
├── inbox.py              # 持久 next-step/next-turn 输入、领取与丢弃
├── scheduler.py          # 队列、并发、取消、恢复
├── adapters.py           # 已提交 Run、凭据和确认适配
├── context.py            # 模型可见历史与上下文组装
├── hooks.py              # 会话 Agent 融合调用、作用域中间件与通知注册
├── notifications.py      # 非否决状态、输入及助手流通知
├── retry.py              # Provider 策略执行、持久退避与取消排空
├── filesystem.py         # 文件观察通知、写入/编辑意图槽与会话观察策略
├── commands/             # 作用域命令注册、计划/权限、压缩和执行日志
├── prompts/system.md     # 用户维护的系统指令
├── runtime/              # 模型/工具契约、循环、类型事件、Reducer
│   └── assistant_stream.py # 带时间的不可变分块、紧凑记录和记录级读取
├── tools/
│   ├── memory.py         # 记忆 Schema、描述、执行和确认事务处理器
│   ├── files.py          # 按路径与行号读取，授权来自当前模型历史
│   ├── read_render.py    # 有界行窗口、语言和模型读取正文
│   ├── file_mutations.py # write/edit 参数、守卫和模型结果
│   ├── file_diff.py      # 与 jsdiff 9 一致的上下文 hunk
│   ├── files_shared.py   # 当前历史挂载与模型文件错误说明
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

助手流按 start → chunk → end 发布。每个 SessionAgent 生命周期内 revision 严格递增，chunk index 从零连续编号，end index 为块数量；chunk 携带毫秒时间及真实块开始／结束、带块索引的文本／推理／工具参数碎片、用量或结束结果。end 的 committed 指向已经提交的 `model.attempt.finished` 序号和真实结果，取消也先结算；结算事务失败则发 abandoned。新 Agent 生命周期重新计数，不重放旧帧。`AssistantStreamAccumulator` 在模型输出进入组装和通知前只捕获一次时间与内容，同类连续文本、思考或同身份工具碎片保存为 `time0 + dt + texts/args`，保留空块、每块边界与时钟回退；块开始／结束、用量和结束结果保留为原始记录。不再保留第二份完整分块数组。快照及工具嵌套参数不可变，执行边界还原为 JSON 数据。工具碎片仅用于记录和展示，只有完整、已校验的调用进入工具调度。

`model.attempt.finished` 必须携带实际 `message_id`、紧凑 `stream`、`stream_origin`、有序 `blocks` 和 `replay_state`。正常、失败及取消尝试都保存已收到的完整输出；超出输出预算的原始块仍记录，用户可见前缀保持预算限制。Reducer 校验消息身份、文本／思考前缀、真实用量和结束原因；失败尝试也先持久结算，再发布结束帧。

`GET /events/stream` 提供一个完整 opening 后的统一订阅。`session.opened` 返回游标之后的持久事件及当前 revision、活动尝试、连续 next_index 和紧凑前缀；`assistant.stream` 的 start/chunk/end 不携带 SSE id，不推进持久游标。订阅、日志读取和前缀切点之间不 await。后续帧按其实际已提交边界补齐日志后发送，避免提前发出未来结算；结束帧的具名结算始终先到达。监听由请求子资源持有，与 Agent 使用同一作用域载体，断开／关闭后释放；慢读取超过 2048 条等待通知时明确断开并记录，重连重新取得快照，不影响 Agent 运行。

前端从同一 opening 加载历史与活动前缀，不再先分页读取历史再开启另一条流。`LiveAssistantStream` 校验连续 revision、块 index、消息身份与具名结算；缺口触发重新连接和完整前缀替换，不继续追加失去边界的碎片。暂态前缀保留到已匹配的 end，committed 后回到持久投影，abandoned 则撤销暂态内容。重连包括全部精确时间，不用合并 delta 猜测运行中内容。

对话和轨迹使用同一实时前缀显示文字、思考和首 token 时间；思考与正文按字符码点共同遵守剩余输出预算。工具生成行复用 Mu 工具行、图标与详情组件，明确标记“正在生成参数”，不会创建或执行占位工具调用。完整模型调用结算后才显示真实工具生命周期。运行中的轨迹“输出流”也可打开，结算后读取嵌入流、内容块与 replay；已提交的附件与图文工具结果使用同一预览组件。

迁移 `0006` 只将旧事件中已知的合并正文／思考块写入流，标记 `stream_origin=buffered`，不编造原始工具碎片、用量块或 token 时间。历史消息正文与状态保持原值，旧流不用于精确首 token 延迟。

## 内容块与模型回放

助手的 `ModelMessage.content` 仅接受有序不可变的 text、reasoning、tool-call 内容块；用户和工具结果可携带独立图片引用，移除了平铺正文、独立思考及完整工具调用 DTO。工具块保留供应商原始 JSON 字符串，实际调度边界解析为对象；工具请求和下一步历史都校验 ID、名称及参数语义与结算块一致。OpenAI Chat 将正文／思考／各工具索引映射到首次出现的逻辑索引，发布开始／碎片／结束，并在结束结果保留实际响应元数据；请求编码仅发送该协议支持的字段。

`BlockAssembler` 是块、用量、结束和回放的唯一组装来源；紧凑记录保留实际观察事实。第一个 block-end 是权威内容，可以替换预览文字、思考、工具身份及参数；重复开始、重复关闭与关闭后碎片不改变组装结果，运行边界记录警告，原始观察仍保留。未闭合块的 delta 类型改变、重复用量及终止后输出仍明确报错。Reducer 展开并验证同一语法，结算后用规范块替换正文及思考投影。最终内容变长时补计字符预算，按已交付预览与规范文本／思考总量的较大值收费，缩短不退款；失败／取消预算快照和前端下一步剩余额度来自同一结算结果。权威闭合本身超预算时保留预算内的规范前缀并失败，不能以短预览绕过上限。没有结算的进程中断仅保留已提交 delta 对应的文本／思考块，不编造遗失的原始边界、签名或工具调用。

取消、异常和字符预算耗尽只保留安全文本／思考，不回放工具或 replay。模型 length 结束丢弃工具块，并同时裁剪 replay 的对应条目；条目数量与首次出现块数不一致时丢弃整个 envelope，运行边界记录警告。ReplayEnvelope 的响应及嵌套条目都不可变，记录序列化为普通 JSON，历史回传保留原值。Chat Completions 仅编码其支持的历史字段；原生 Messages 保留并回传真实思考签名，不向请求虚构签名。

对话按块顺序复用 Markdown、Mu 思考行与工具组件，连续工具保留已有分组。闭合内容立即替换实时预览，迟到碎片不会撤销权威内容或遮断后续有效块；只有真实文本／思考／工具 delta 提供首 token 时间，仅结束块的内容不编造 token 边界。实时前缀与结算内容采用相同首次出现顺序及码点预算；轨迹上下文先从块提取正文，详情保留完整结构。迁移 `0007` 重编号旧文本／思考／工具索引，以原观察时间转换已知完整调用；有碎片时保留原参数字符串，并校验与旧完整对象一致。buffered 来源的调用仅来自已提交 tool.requested，不编造原始工具流；旧请求快照也转换为块，不保留运行时旧格式分支。

## 模型协议与签名回放

`integrations/model/adapter.py` 统一 HTTP 生命周期、凭据读取、SSE 分帧和稳定错误；`connection.py` 提供不可变配置与 URL 校验。`openai_chat_request.py`／`openai_chat_stream.py` 和 `deepseek_messages_request.py`／`deepseek_messages_stream.py` 分别承担两种显式协议的编码、解析，不在失败后切换协议或地址。旧 `openai_compatible_adapter.py` 和 `openai_compatible.py` 已移除。

DeepSeek 新连接默认 `deepseek_messages` 与 `https://api.deepseek.com/anthropic`，请求追加 `/v1/messages`；已含 `/v1` 时不重复追加。模型请求使用 `x-api-key` 和 `anthropic-version: 2023-06-01`。官方模型目录仍从根 `/models` 获取，使用该目录接口的 Bearer 认证；自定义 Messages 目录使用配置地址的 `/v1/models`。`provider_client.py` 的文本与工具检查直接使用非流式 Messages，关闭思考并验证真实块及工具参数。DeepSeek 与自定义连接可在设置页切换协议；改动增加修订，清除旧检查与推理声明，队列和运行占用时拒绝更改。既有连接保持其显式配置。

原生思考档位为 off／low／high／max，默认 high。声明来自所选协议，目录来源记录为 `protocol`；请求编码为 thinking 与 output_config.effort。新 Messages 运行使用 harness 的 256000 输出 Token 上限与 300 秒流空闲超时，应用现有运行调用数、工具数、字符和活动时间预算仍生效。

解析器严格校验 message_start、块开始／碎片／闭合、stop_reason 和 message_stop；供应商稀疏索引按首次出现顺序映射到连续逻辑索引。完整初始工具 input 与分片 JSON 分开处理；长度截断的工具和对应 replay 由核心组装器同时裁剪。流错误、未闭合、无终止结果和非法输入均明确报错。缓存读写 Token 保留在原始用量块，总量包含缓存计数，不凭缺失字段推测。

助手生成时从当次 request.header 冻结 `source_model`，同一 Run 后续切换模型也不改写旧身份。ReplayEnvelope 使用 kind=deepseek-messages、version=1、请求模型及按块 signature 元数据；请求验证其来源模型、块数量和类型，同模型回传签名，跨模型保留正文与思考但不携带原签名。伪造或不匹配的原生 replay 直接报错。工具历史编码为 tool_use／用户 tool_result，携带真实 is_error，合并相邻角色并要求立即返回完整批次；非法历史参数不会替换为空对象。

迁移 `0008` 扩展连接、运行快照和推理声明约束，不重写历史事件。已填充的 0007 库升级后保留全部记录和 journal，完整投影重建通过。临时 HTTP 供应商与实际默认 ModelPlugin 验证设置保存、原生检查、工具执行、签名续接、对话刷新及轨迹；离屏 Electron 验证桌面与深色 600px 窄屏。未知会话子路径的旧重定向循环已移除。

## 扩展 Tool

同类工具放一个功能文件；变大后再拆同名目录。工具自带 Schema、描述、风险级别、执行方式和校验。

1. 在 `agent/tools/<功能>.py` 实现工具。
2. 在贡献插件中声明 `requires`，从 Context 获取服务或仓储。
3. 调用 `TOOLS.register(owner, name, ToolRegistration(builder, write_handler))`，贡献随 owner 释放。
4. 在产品组合的 `plugins` 参数中启用插件；会话专属扩展通过 `install_plugin(agent.ctx, plugin)` 安装。

默认启用 `MemoryToolsPlugin` 的 `memory_read`、`memory_write`，`SkillToolsPlugin` 的 `skill`、`skill_resource`，`TodoToolsPlugin` 的 `todo_write`，`FilesystemToolsPlugin` 的 `read`、`write`、`edit`，以及 `AttachmentToolsPlugin` 的 `read_image`。模型提供者和循环提供者可分别通过 `model_plugin`、`loop_plugin` 显式替换。没有旧路径、静态插件包装或工具名分支兼容层。

L0 工具可直接执行；L1 工作区文件工具为独占调用，在 workspace-write 权限下直接执行，计划／read-only 模式拒绝。L2 记忆写入必须注册同名事务处理器。确认服务保留精确参数快照，批准后调用处理器；数据库业务修改、确认和工具结果同一事务提交，失败一起回滚。远程业务应另建持久作业与监督流程。

工具批次按 deepseek-harness 的屏障与并发池执行：连续的 L0 并行工具最多同时运行四个，独占工具等池排空后执行。开始事实先持久提交，再调用工具；结果按模型发出的顺序提交。批次预留工具次数与活动时间，结束时按实际用量结算；取消会停止补充任务、等待已启动任务退出，并将未完成调用标记为取消。恢复重新执行安全的只读调用，保留已经结算的结果。

模型提供的参数在调用事件中原样保存，校验在执行边界进行。未知工具、参数错误、权限拒绝、资源不存在和执行超时均记录真实 `tool.failed` 结果，后续模型请求可以读取错误并修正；这些结果不会直接终止 Run。协议错误、预算耗尽和持久化错误仍结束运行。完整的工具批次包括已完成与已失败调用，不包括仍在运行或等待执行的调用。

## 任务列表

`TodoToolsPlugin` 通过现有作用域工具注册器提供 `todo_write`，使用 `{todos: [{content, status}]}` 整表替换当前 Agent 任务列表，没有任务 ID 或局部更新。状态为 pending／in_progress／completed；内容去除首尾空白，拒绝空项、重复内容、额外字段及多个同时执行的任务。当前产品执行顺序任务，尚未装配并行 Agent；空列表表示清除计划。工具在计划／只读模式中可用，更新会话进度而不修改业务数据。

`ToolResult.events` 携带经过校验的同 Run 事件草稿，Runner 仅在工具成功结算时将它们与工具结果一起提交；失败、超时或取消不提前发布快照。`todo/write` 关联实际运行中的工具调用，Reducer 校验快照与规范化参数一致。会话投影保留最新不可变列表和所属 Run；新 Run 首次开始时清空，轮内模型／工具阶段切换不清空，结束后日志和投影保留最终列表。模型通过正常工具结果读取列表和各状态计数。

前端从同一订阅事件恢复当前计划。对齐 Mu 的输入框上方计划栏：与输入框同宽，展示完成数、支持折叠，列表高度最多 min(22vh, 180px)，只显示正在运行的所属轮次。工具详情复用任务列表组件，轨迹保留每次完整替换事实。

## 扩展 Skill

默认组合分别启用 `SkillPlugin`、`FilesystemSkillsPlugin` 和 `SkillToolsPlugin`。`SkillRegistry` 支持作用域 Provider 注册、元数据目录、模型/用户调用限制，以及显式读取正文。同名技能由最近作用域优先；同层按来源 rank 决定。来源报错和不匹配的正文直接报错并记录日志。

来源实现放 `agent/skills/`，模型调用工具放 `agent/tools/skills.py`，内置指令放 `agent/skills/bundled/<name>/SKILL.md` 与相邻资源。用户技能保存在应用数据目录的 `skills/`，工作区技能保存在 `workspaces/<workspace_id>/skills/`，也会发现 `~/.agents/skills`。

`ContextPreparationRegistry` 在每次模型步骤组装历史前运行带作用域的异步贡献。技能消费者重新发现目录，比较实际名称和简介列表；变化时追加 `context.injected` 完整替换，不计算文件 hash。目录只在原 `skill` 注册实例可见时发布，同名工具遮蔽发布空目录；压缩后不可见的目录会重新发布。目录事件携带 `producer=skill-catalog` 和实际条目。

`/技能名` 扫描当前步骤已接纳的真实用户消息，使用空白边界，支持消息任意位置的多个名称；按首次出现顺序与用户权限加载，同一步重试、恢复及重复名称不重复加载。处理器追加的上下文消息不能授予用户调用权限。正文、来源、消息身份、Run 和 step 以 `producer=skill-invocation` 持久保存；所属步骤实际发送后进入后续历史。前端从步骤接纳及实际加载事件生成消息标记，标题栏汇总用户与模型加载的技能；指令预览使用历史快照，不随文件编辑重写。

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

附件专用格式读取、跨会话引用、PTC 与多 Agent 委派仍是后续对齐项；原生签名回放和图片／文件附件已接入。

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

助手流探针验证逐块内容／时间无损展开、负时间差、快照不可变、实际工具仅执行一次、观察帧与已结算记录一致，以及结束帧晚于事务提交。超预算前缀、重复用量、伪造结算和参数未完成时取消均通过；取消碎片从不执行工具。0004／0005 临时库升级至 0006 后重建投影，消息正文、状态和记录数量不变。离屏 Electron 使用本地 HTTP SSE 供应商完成思考、工具碎片、真实记忆读取和最终回复，验证轨迹输出流、精确计时、窄窗口布局，无横向溢出或渲染错误。

统一订阅探针通过真实 HTTP 的持久序号连续、原始帧无游标、工具参数中途重连、精确前缀与结算前 end 禁止。实际 wire 在前端折叠器完整重放，逐块时间与持久流一致；取消未完成参数不执行工具。慢读取溢出明确报错，重连取回完整结算；请求释放后子作用域与数据库监听均移除，Agent 继续正常结束。离屏 Electron 验证生成参数展开、刷新恢复、实时轨迹流、结算撤销暂态及深色 600px 布局，无溢出和页面错误。

内容块验证通过非连续索引的交错文本、仅结束块的正文／思考、原始参数和下一步 replay 回传、矛盾关闭、取消、字符预算、无效工具 JSON、length 裁剪与元数据对齐。0004／0005／0006 三份临时库升级至 0007 并重建投影，31 条消息的正文和状态不变。实际 HTTP 断线恢复原始块前缀；前端 wire 重放保持连续边界与规范文本顺序；离屏 Electron 验证生成参数、刷新恢复、轨迹及结算，修正请求上下文旧字符串渲染错误，无页面错误或窄窗口溢出。

权威闭合验证通过预览替换、完整工具身份与参数替换、迟到文本／参数、重复开始／关闭、空 delta 后闭合、下一步历史与 replay 保持、最终扩张及下一步输出预算、缩短不退款、空结算、取消和全量投影重建。前端验证相同组装语义、下一步码点预算及仅结束块不记 token 时间。

`ruff check`、`compileall`、后端模块导入及 `uv build` 通过；全新临时数据库的 FastAPI lifespan 启动和关闭通过。

验证使用临时脚本与临时数据库，不请求真实模型，不修改用户数据库，不新增测试文件。开发数据库迁移随功能提交。

## 会话命令与推理参数

`CommandsPlugin` 提供作用域 `COMMANDS` 服务；定义由插件贡献，会话子作用域可以安装专属命令。API 发现当前会话定义并合并可由用户调用的 Skill；前端仅贡献 `/model` 选择面板。执行持久化 `command/run`、`command/done`，相同请求身份返回同一结果。命令结果属于会话控制记录，不自动变为用户消息；只有 `/plan <需求>` 明确受理模型轮次。

计划、权限和压缩状态来自持久事件。每个模型步骤重新读取计划提示词；写工具策略及批准路径重新检查当前权限。压缩保留原始事件，以摘要和边界替换后续模型历史。`/goal` 尚无目标状态和自主续跑服务，不注册占位命令。

推理档位及默认值来自模型列表元数据，经过目录、持久记录和 API 传到选择面板。DeepSeek 的 `off` 在适配器映射为关闭思考；其余档位按原生值发送。流式思考独立保存为 `message.assistant.reasoning.delta`，与正文共用输出预算；携带工具的请求回传历史思考。


## 附件输入与文件读取

`session_attachments` 保存会话归属与不可变收据；字节位于数据库同目录的 `attachments/<UUID>/content`，图片的原上传字节仅供身份重试校验，保存在固定 `source` 文件。API 先校验完整批次，规范化图片，再事务发布收据。重复身份必须保持源字节、声明、规范化结果和归属一致。消息受理在同一数据库事务内解析附件身份，客户端不能声明路径或伪造元数据。

`MessageInputPayload` 将引用贯穿用户消息、双队列和步骤决策。步骤不能引入原输入不拥有的引用；重建投影保留引用。模型历史使用独立 `ImageInputBlock` / `FileInputBlock`，助手输出仍只接受 text／reasoning／tool-call。`RunImageResolver` 仅物化当前运行实际可见的图片，HTTP 适配器根据明确协议编码；请求头 journal 保留元数据而不保存 base64。

`FilesystemPlugin` 提供独立 `fs` 与观察接缝，`FilesystemToolsPlugin` 消费服务并贡献 `read`、`write`、`edit`。旧字符分页工具已移除。相对路径以 `/workspace` 为根，映射数据库同目录的 `workspaces/<workspace_id>/files`；逐级目录描述符禁止跟随符号链接，拒绝越界路径、目录和管道。写入可创建父目录，新目录为 0700、新文件为 0600；替换保留原 POSIX 权限。

文件附件的模型文字句柄包含精确 `/attachments/<UUID>/<name>` 路径。这是只读挂载标识，不是服务端原生路径；读取权限来自当前运行实际模型历史，读取字节时再次核对同会话不可变收据。未准入草稿、未来队列和压缩边界以前的附件不自动授予读取权限。

`read` 使用 1 基行号，默认 offset=1、limit=2000，上限 2000 行；每行保留最多 2000 个 UTF-16 单元，选中内容最多 50 KiB UTF-8。先 stat 校验普通文件与取得版本；小于 10 MiB 的文件整读，大小未知或达到阈值时流式处理。解码按 64 KiB 分块，去除初始 UTF-8 BOM，前 8192 字节发现 NUL 或任意位置 UTF-8 解码失败均报 `FS_NOT_TEXT`；取消报 `FS_ABORTED`。窗口达到上限后继续扫描，保存精确总行数；空文件与 CRLF 按 harness 语义处理。模型正文使用 `<path>`／`<type>`／`<content>` 包装和续读 offset，展示数据独立保存路径、实际行号、总行数、截断标记及可选语言。

对话工具行默认折叠，展开后显示实际行号、读取范围和下一 offset；轨迹概述与结果页复用同一组件。持久重建和页面刷新保留读取窗口。搜索、工作区图片读取、PDF／Office 专用读取器与真实供应商图片能力探测仍待实现。

## 文件观察、原子修改与变更卡片

`FilesystemObservationPlugin` 单独注册同步观察通知与写入／编辑的单决策槽，不提供文件 IO 服务。观察状态以实际会话 Context 为弱引用所有者，按提供者目标身份保存 present/version 或 absent；不同会话不共享，插件释放清空。读到缺失路径记录 absent，成功读到窗口才记录 present；成功写入或编辑立即更新 present。观察通知只更新状态，不参与 IO 事务；监听器报错会记录日志，同步约定被违反也明确记录。

未观察或确认不存在的目标产生 create-if-absent；已观察存在的目标产生 replace-if-version。编辑未观察报 `FS_NOT_OBSERVED`，已确认不存在报 `FS_NOT_FOUND`；缺失或版本失配先于文本匹配报 `FS_STALE_VERSION`。本地版本由 dev/ino/size/mtime_ns/ctime_ns 组成，工具与策略把它当作不透明值。版本状态按 harness 的活会话生命周期保存，不从历史 journal 恢复；重启后覆盖已有文件必须重新读取。

提供者按目标 FIFO 排空并序列化修改，在锁内校验类型和版本。写入通过同目录私有 UUID 暂存目录与固定 content 文件，独占创建、保留权限、fsync、取消检查后发布；创建使用 hard-link no-replace，替换使用 rename。发布前再次校验版本；外部进程的替换仍存在版本检查与 rename 之间的竞态，进程内修改和创建碰撞有原子保护。暂存链接清理后才取得最终版本，避免 ctime 导致随后的编辑误判。

`edit({file_path, old_string, new_string, replace_all?})` 做非重叠字面替换，默认必须唯一；缺失匹配报 `FS_EDIT_NOT_FOUND`，多匹配报 `FS_AMBIGUOUS_EDIT`。匹配前将 CRLF 规范化为 LF，写回恢复前 4096 UTF-16 单元采样的行尾风格；二进制或无效 UTF-8 拒绝编辑。`write` 接收完整文本，包括空文件；可展示的覆盖前文本基线必须小于 10 MiB，二进制或越过基线边界时记录 before=null，展示明确保存的新全文。

模型只收到 harness 的创建／更新包装或编辑成功说明；JSON 展示结果独立保存 operation 与真实应用的三行上下文 hunks。`file_diff.py` 移植 jsdiff 9 的 Myers 路径、平局规则和 hunk 合并边界，保留原 BSD-3-Clause 许可证；前端复用同版本 diff 包展示上下文与增删行数，不从当前文件重新构造历史。对话与轨迹共用 Mu 风格变更卡片和浅色／深色语义颜色，页面刷新与重建恢复原应用结果。

`ToolExecutionError` 携带明确 code，Runner 将文件错误码原样提交，模型能识别重新读取的修复说明；不把它们统一改成普通执行失败。可取消线程在每块和发布前检查信号，取消处理等待线程退出再释放运行。文件发布与会话 journal 属于不同存储事务：取消／进程退出发生在发布与工具结果提交之间时可能留下已修改文件；恢复时版本或创建守卫会要求重新读取，不盲目覆盖。


## 模型图片声明与请求投影

`ModelImageInput` 为严格、不可变配置，包含 `enabled`、`pixel_budget`（默认网格／low／正整数）和 `max_bytes`（默认 2 MiB）。目录编辑需要连接锁并检查未完成／排队引用；执行修订变更清除声明。`0010` 迁移，新增目录和运行快照 JSON 列，旧事件不改写。接收、steering、恢复和路由统一使用所对应的冻结声明，默认仅文本，不从模型名字猜测图片能力。

HTTP 适配器只读取真实可见图片，通过 harness 几何算法做请求投影；固定格式与质量，单张超限明确失败。身份、规范化收据和源字节不随请求变化。每个身份只准备一次，整次请求按图片实际出现次数限制 600 张及 20 MiB base64；投影日志和模型的附件文字句柄包含请求尺寸／字节数，不保存 base64。未支持图片的目标模型不能读取图片后偷偷替换成文本。整次图片超限的卸载机制见下一节；Files API 仍待实现。


## 图片卸载与错误恢复

`ImageOffloadPlugin` 在 `RetryPlugin` 之前处理 `IMAGE_OFFLOAD_REQUIRED`。适配器按实际请求字节与出现次数计算需要卸载的最旧前缀，以 20 张／10 MiB 量阶梯释放余量；超限时不发送模型 HTTP 请求。独立图片的二进制缓存达到内联上限后释放，后续只测量长度。单张图片编码限制和模型能力检查仍为明确错误。

`image/offload` 仅包含 `targets`，每个目标记录 `sequence`、`message_id`、`image_indexes`。输入来源对应用户事件、当前步骤准入事件中的具体消息，或 `tool.completed` 的 `tool_call_id`；图片索引只数图片，保留之前已卸载图片的索引位置。纯会话投影在提交和重建时校验当前输入节点、最后请求可见性、来源收据与已有选择，整体批次失败不会写入部分选择。消息、附件存储、预览不改变；新出现同一附件使用新的来源坐标，不恢复旧出现或继承其省略状态。

`RequestErrorAction` 使用 `RequestRetry | None`，移除字符串动作。`RequestRetry(rebuild_context=True)` 使下一请求重新构建历史，但不会重新执行步骤准入。图片修复先提交选择，然后记录新的尝试与请求头，不生成供应商 `llm/retry`；模型调用和时间预算照常约束。中断发生在选择提交与新尝试之间时，重启恢复仍从持久事件重建省略状态。省略文字提供 `read_image` 与精确的 `file_path`；工具成功读取会创建新的图片出现，不解除旧出现的省略选择。用户和工具图片使用相同的前缀选择、持久验证和错误恢复。


## 多模态工具结果与图片读取

`ToolResult.content` 是非空、不可变的 text／image 内容块，`result` 是独立的 JSON 展示数据。Runner 直接校验和提交内容块，不再解析 JSON 字符串构造结果。助手历史使用已结算的 `content`，工具来源绑定完成事件的 sequence 与 tool_call_id；新工具结果不能带省略标记、重复图片身份或超出单批附件边界。会话投影要求图片引用与当前请求可见收据一致，或具有本次工具调用的实际生产者身份；提交与重建还会在数据库事务中验证会话归属及收据完全相等，不能借工具结果注入草稿、未来队列或其他调用的图片。图片完整引用只保存在内容块，`read_image.result` 仅包含已解析的路径。

`read_image({file_path})` 是 L0 并行工具，对齐 harness 的路径输入与图片内容输出。它先要求本次已提交 request.header 冻结的模型声明图片输入，再通过当前历史的文件作用域解析 `/workspace` 或精确的 `/attachments` 路径，包括已省略图片；不接受任意服务端路径或未准入附件。支持 PNG／JPEG／WebP／GIF，以及按签名识别的无扩展名图片。读取前检查普通文件与 16 MiB 上限，读取后验证完整字节数和版本；新图片经过规范化、请求能力检查并持久发布收据，生产者绑定实际 run_id 与 tool_call_id。已准入图片复用其规范化收据。成功后记录原文件的观察版本，返回规范化尺寸、原尺寸与坐标缩放说明，以及真实图片内容块；失败产生明确的 tool.failed。图片出现仍可单独省略、重读并跨重启恢复。对话与轨迹都展示实际路径，可打开文件预览；附件和文件预览复用适应尺寸的图片弹窗。0012 迁移将历史名称展示数据转换为附件路径，运行时没有旧参数或旧字段分支。PDF／Office 专用读取器和更完整的 Files API 仍待实现。

Messages 原样将图文内容嵌入 tool_result。Chat Completions 按 harness 的 pi-ai 适配方式保持整个批次的文字 tool 消息，随后追加承接图片的 user 消息；不向 tool 的文本字段塞入 image_url，也不插入虚构助手回复。Canonical journal 仍记录真实工具来源，协议投影不创建会话消息。工具图片按出现次数计入同一图片限额，可通过其完成事件坐标再次卸载。

迁移 `0011` 显式将旧 tool.completed.result 转成原先 `_json_text` 的排序、紧凑 UTF-8 文本块，填充工具投影的 content 列；保留结果原值、事件身份、时间与顺序，其他事件不改写。运行时和 API 只使用新结构，没有旧 JSON 字符串兼容分支。前端默认折叠工具行；展开时复用已有附件卡片、鉴权加载、预览和下载。轨迹概述与结果页显示同一内容块图片。图片省略标记从完整轨迹事实计算，不依赖最多 256 个近期原始事件，避免长会话丢失来源。

## 文件搜索与前台子进程

`SearchPlugin` 对应 harness `tool-fs-search`，独立于 `FilesystemPlugin`；提供 `subprocess` 服务并注册 L0 并行的 `glob`、`grep`，不把搜索塞入 `fs` 接口。Electron 注入固定版本 `@vscode/ripgrep@1.18.0` 的平台二进制，后端从 `KUNYU_RIPGREP_PATH` 读取绝对路径；缺失或损坏明确报 `SEARCH_FAILED`，不尝试系统命令或其他搜索实现。当前原生目录 IO／进程组实现面向 POSIX。

`LocalSubprocess` 仅接收 argv，不使用 shell。搜索先通过 descriptor-relative、no-follow IO 创建／打开当前 workspace 的托管根，再将目录描述符继承给独立 Python 启动入口；入口 `fchdir` 后 `execv` 替换为 ripgrep，不在有线程的父进程使用 `preexec_fn`。`--no-config` 禁止主机 ripgrep 配置注入预处理命令。stdout 完整捕获上限 20,000,000 字节，stderr 仅保留 64 KiB 尾部；原始 stdout 超限明确失败，不解析部分输出。取消包括启动竞态和重复取消，等待进程组 TERM／最多 3 秒／KILL 和管道排空，不留下后台任务。工作区根固定在描述符上；显式子路径在启动前校验，未提供对外部进程并发替换子路径的系统级沙箱。

工具声明 30 秒 `timeout_ms` 和 `SEARCH_ABORTED` 超时代码；Runner 根据实际工具声明分配并行批次的时间预留，全局运行预算继续约束声明，未声明工具保持统一的 5 秒策略。超时后的终止清理可能多用最多 3 秒；沿用原有预留内计费契约。失败区分 `SEARCH_INVALID_PATTERN`、`SEARCH_FAILED`、`SEARCH_RAW_OUTPUT_OVERFLOW`、`SEARCH_ABORTED`，不返回伪造的空结果。

`glob` 使用 `--files --glob --sort=modified --no-ignore --hidden`，排除六类 VCS 内部目录；结果最多 100 个。部署显式采用顶层条目轮转采样，与完整修改时间顺序列表分别保存。`grep` 使用 `--json --regexp`，默认遵守隐藏／忽略规则；一个正向 `include` glob 按 ripgrep 语义覆盖匹配文件的这些规则，支持 brace alternatives，拒绝否定和括号外逗号列表。逐行解析真实 JSON 匹配，保留前 250 处、每行最多 2000 UTF-8 字节的预览及截断标识；不使用 Python 正则替代 Rust 正则。非 UTF-8 行使用 harness 的明确标记，损坏 JSON／非文本路径失败。

Canonical `content` 与 `paths`／按文件分组的 `matches` 展示元数据分离。元数据以 64 KiB 紧凑 UTF-8 JSON 为目标，移除尾部完整路径／文件组，但至少保留一项，因此单个极大的文件组可能超过目标上限，符合 harness 的保留约定。前端严格解析新结构，在对话与轨迹共用 Mu 风格的文件列表、匹配行表格、复制与折叠展示，显示真实保留数／总数和空结果；不从模型参数重建结果。

超过条目上限时必须保存完整格式化结果（grep 的每行预览仍有 2000-byte 边界），不提供保存失败后继续成功的分支。存储采用 UUID 目录与固定 `glob-results.txt`／`grep-results.txt`，位于 `/workspace/.kunyu-search/<session>/<UUID>/`。通过 `read` 可分页读取，跨会话读取和模型 write/edit 禁止；搜索排除该内部目录，避免结果再次进入搜索。读取到的路径与普通 workspace 文件共用挂载。搜索不触发文件版本观察：发现文件后仍须 read，再 edit/write。文件发布与 journal 不在一个事务；未提交成功事实的孤立恢复文件不授予模型路径，后续生命周期清理仍待完善。采样与渲染移植保留 DeepSeek MIT 许可证，根目录和 Python 包均携带副本。

## 人类文件预览、编辑与下载

`application.file_preview.FilePreviewService` 处理目录列表、完整预览和原件下载，`api.files` 只负责鉴权接口与错误映射。复用文件系统提供者的目录描述符／no-follow 读取；工作区取实际会话归属，文件附件要求同会话精确收据与名称，恢复文件继续按会话隔离。人类预览允许查看尚未送入模型的文件附件，但不触发 Agent observation，不改变模型从实际历史取得的文件授权。

`GET /api/v1/sessions/{session_id}/files/preview?path=...` 先 stat 返回不透明版本、源字节数与类型。文本最多 1 MiB，图片源最多 20 MiB，PDF 最多 32 MiB，不支持类型与超限仅返回明确状态，不读取内容。文本整读后验证版本和实际长度，严格 UTF-8 解码并去除 BOM，保留 CRLF；不返回截断文本。`/image` 要求对应版本，复用图片规范化，可能缩小大图或取首帧；`/download` 读取原始字节，提前打开文件再发送响应头，精确长度并在断开或取消时关闭生成器／描述符。API 原件下载使用流式响应；当前前端下载通过鉴权 Blob，仍会在 renderer 中持有整个下载文件。

前端 `features/files` 统一管理目录树、预览标签、宽度、查看器与入口。文件标签按规范化路径去重，刷新重新读取当前版本；变更标签按真实 tool_call_id 定位 journal 投影的原始 hunks，避免把后续编辑当作历史变更。会话存储分别保存标签描述／宽度和未保存修改；源码按需加载 CodeMirror 语言包，保持虚拟化，工作区普通文本可编辑，附件和内部恢复文件只读。Markdown 文件链接可按当前文件目录解析并定位行号；HTML 在独立 sandbox iframe 内，仅允许内联脚本和样式，CSP 禁止网络。PDF 通过版本绑定的完整二进制读取与独立 Worker 渲染；Office 与 HTML 本地资源加载仍待实现。

PDF 的 `/pdf?path=...&version=...` 复用相同会话文件作用域，只接受 PDF 路径和实际 `%PDF-` 文件头，拒绝将图片收据伪装成 PDF；读取前检查 32 MiB 上限，读取后再次验证版本和完整长度，返回原始 `application/pdf` 字节。元数据检查不读取 PDF 内容，人类查看不授予 Agent 编辑权限。文件树、Markdown 链接及 PDF 附件卡片均可打开该预览，附件仍只读。

前端 PDF 按需加载与 harness 相同的 `pdfjs-dist@6.3.289`。一份挂载文档独占一个真实 module Worker，通过启动握手后才建立 PDF.js 的 port；Worker、字体、CMap 和 WASM 解码器统一打包，资源缺失或 Worker 失败明确报错，没有主线程解析或网络资源替代。取消和关闭销毁解析任务、渲染任务、文字层、原生 Worker 与 Blob URL；错误清理保持日志。每页按当前显示比例与 DPR 渲染，像素分配最多 16,777,216，文字层随页面比例缩放并支持选择复制。完整页面几何以四路并发加载，首屏附近和目标页面按需渲染；连续页面支持横竖混排、页码跳转、25–400% 缩放与适应宽度。标签描述保存当前页和缩放，切换、刷新与窗口内重载恢复，文件缩短时限制到新页数。加密 PDF 明确提示需要密码，当前没有解锁输入；也尚未提供全文搜索、打印、批注及 Mu 原生 PDF webview 的全部控件。PDF 前端渲染不构成独立 `read_pdf` Agent 工具，参考 harness 本身也没有该工具。Office 和更多文档能力继续待对齐。

`GET /api/v1/sessions/{session_id}/files/list?path=...` 只列当前工作区目录的一层。Filesystem 新增目录列表契约，`filesystem_directory` 负责有界扫描；根目录按需建立托管存储，缺失用户目录不会被创建。支持普通隐藏文件，排除内部搜索恢复目录及 UUID 原子写入暂存目录；类型来自 no-follow stat，链接与特殊文件标记 other，不可打开。后端稳定名称顺序截取前 2000 项并标记 truncated，扫描只保留上限加一的候选名称；选中条目在 stat 前消失则明确报 FS_STALE_VERSION。根目录作为真实 directory 解析，read/write/edit 继续拒绝它作为文件。

文件树位于预览面板外侧，按工作区保存展开路径、开关偏好及 260px 默认／220–500px 宽度，不缓存列表。按需加载各级目录，并以目录优先、自然名称排序展示。根及展开目录订阅原生变化并自动重新列出；手动刷新覆盖根和已展开目录，关闭的目录在下次打开时重新读取。已移除通过 tool.completed 推断刷新时机的旧实现。


## 原生文件变化订阅

`Filesystem.watch` 返回拥有生命周期的异步生成器；`FilesystemWatches` 由文件系统插件装配，同时接收真实 `fs/observed` 通知。先注册 follower，再验证逻辑挂载路径、建立原生监视，随后读当前 metadata 并发送 ready。文件只接收目标变化，目录接收自身及直接子项；合并通知后重新 stat，不读取内容、不记录 Agent observation，也不授予修改权限。不可变附件不订阅变化。

`watchfiles==1.3.0` 的 RustNotify 使用原生 Recommended 后端；构造出的轮询后端明确拒绝，不采用环境变量控制的轮询或重试分支。原生等待使用独立线程，避免长寿命订阅占满默认 IO 线程池；关闭时设置停止信号，排空原生线程与 metadata 读取，再释放描述符。当前目录 IO 依然面向 POSIX。描述符验证和 native path 监视之间不具备系统级竞态隔离；stat／内容访问仍逐级 no-follow。

`POST /api/v1/sessions/{session_id}/files/changes` 严格接收 `{paths: [...]}`，最多 128 个不重复的规范化目标，每项最长 4096 字符。在发送响应头前统一验证会话归属和逻辑作用域；原生初始化在响应任务中独立执行，目标级失败通过带 path 的终止 `file.error` 记录和传输，不中断其余目标。`file.ready`／`file.change` 传输规范化逻辑路径及当前版本／类型／大小或 absent。每个响应统一拥有原生生成器、128 帧有界队列及任务组；断开、发送失败和服务关闭排空线程、metadata 读取和生成器，正文尚未开始时也会释放资源。已删除原逐路径 GET 接口。

前端 FileWatchProvider 按目标引用计数，把根、展开目录和保留的文件标签合并到会话的一条 POST 事件流，避免大量长连接阻塞保存和其他请求。目标集合变化重新订阅，通过 ready 的当前 metadata 检查连接切换期间的变化。失败目标保留明确错误，新增其他目标不会自动重试，只有用户明确重连才重新加入。根目录始终订阅，展开目录按挂载生命周期订阅。workspace 文件标签在隐藏预览或切换标签时保留订阅与已加载快照；内容不自动替换，版本差异点亮琥珀色刷新按钮，手动刷新消费新版本。关闭标签清理快照和订阅，会话卸载清理全部缓存；超限／不支持类型隐藏刷新，保留下载。失效订阅明确提示并提供用户重连按钮，没有静默轮询或自动替代机制。


## 人类文本编辑与版本校验保存

完整预览返回 `editable`，由工作区挂载、文件类型和完整预览状态决定；附件、内部搜索恢复、图片、不支持类型和超限文件明确不可编辑。`PUT /api/v1/sessions/{session_id}/files/content?path=...` 只接收严格的 `{text, version}`，验证同会话归属、原版本、可编辑状态、UTF-8、无 NUL 和 1 MiB 字节上限，再复用 FIFO 锁及 replace_if_version 原子发布。成功直接返回已提交文本和新版本，保存冲突为 409；删除文件或父目录不会被版本替换操作重新创建。原子发布与外部进程仍存在最后校验至 rename 间的竞态，不宣称系统级事务。

保存属于人类操作，不写 Agent observation，也不回放 journal。原来 tool 私有的 `filesystem_operation` 已移至独立 integration，read／write／edit／搜索与人类保存共用同一停止信号和排空逻辑；取消等待已启动线程退出，不保留旧导出或另一套写入实现。

前端 SourceEditor 替换只读 SourcePreview，支持语法高亮、搜索、折叠、自动换行、撤销／重做及 ⌘／Ctrl+S。保留 CRLF 文件的换行格式，编辑态 Markdown／HTML 分屏直接渲染当前文本。保存按钮位于工具栏最右侧，干净时禁用，有修改时为琥珀色，标签显示未保存圆点。保存期间冻结该文件编辑、刷新及关闭。干净文件再次打开重新读取；有修改文件再次打开仅更新定位信息，保留修改。

未保存文本、原始文本、类型和最初版本按会话存储，切换标签、刷新页面、离开会话可恢复；存储写入失败明确提示并记录，不将编辑标记为已保存。此暂存受 renderer sessionStorage 配额与会话生命周期约束，不等同于写入磁盘。文件已删除或查询失败时仍显示恢复的编辑内容；保存按原版本拒绝覆盖或重建。普通关闭、收起面板、快捷键关闭统一确认；多文件一次汇总，逐个保存全部完成后才关闭／收起，途中失败保持全部标签和剩余编辑。成功保存的前项已写入磁盘，跨文件保存不是单个事务。刷新提供取消／明确放弃编辑并刷新。


## 文本预览分屏与滚动同步

`TextPreview` 独立管理文本展示，复用 SourceEditor 和 MessageMarkdown；FileViewer 保留读取、版本与类型分流。Markdown／HTML 分屏按 Mu 的默认 50% 与 20%–80% 边界展示编辑器／预览标题，支持指针拖动、双击复位及键盘调整。宽度偏好存入独立 localStorage 项；写入失败显示明确提示。分屏开关属于预览面板，切换普通文件保留；切换源码／预览模式关闭分屏。行号定位继续转到源码，不丢失编辑；页面刷新重新初始化分屏开关，保留宽度偏好。

`usePreviewScrollSync` 使用目标适配接口，按整个可滚动区间的百分比双向同步，不声称按相同文本行或元素定位。源码直接提供真实 CodeMirror scrollDOM，Markdown 提供实际滚动元素。帧锁和预期回声抑制循环；关闭分屏与卸载取消帧任务。虚拟文本跳转后使用 CodeMirror requestMeasure 重新校准估算高度带来的位置变化，用户滚轮、触摸、指针或键盘操作立即接管。编辑器布局变化后测量并广播真实比例，窗口缩放与分屏宽度变化也重新同步。

HtmlPreview 保留 allow-scripts、无同源权限的隔离 iframe 和原有 CSP；不开放网络、宿主 DOM 或本地文件。随文档生成独立消息通道，父页仅接收当前 iframe 的有限滚动消息，并校验来源、通道、消息类型和 0–1 有限百分比；只发送滚动位置命令。文档替换与卸载清理订阅，旧文档消息不能驱动当前编辑器。本地 HTML 资源与桌面 webview 等仍待单独对齐。
