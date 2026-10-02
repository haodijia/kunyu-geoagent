# 后端 Agent 结构

Agent 架构必须对齐本地 `deepseek-harness` 源码的服务、插件、作用域、生命周期和持久会话边界。Python 实现保留单一 `kunyu` 包；包名不影响这些机制。`bootstrap.py` 选择组合，插件通过声明依赖构造服务，运行时通过 Context 取得服务。

## 源码对应

参考根目录：`/Users/dijkstra/project/02-ts/deepseek-harness`。

| deepseek-harness | 坤舆实现 | 对齐内容 |
| --- | --- | --- |
| Cordis 服务定义与插件组合、`packages/bundle/base` | `agent/kernel.py`、`services.py`、`bootstrap.py`、`plugins/` | 服务定义与实现分离，依赖顺序安装，重复提供者和缺失依赖报错，失败回滚，提供者卸载释放依赖者 |
| `core/scope/src/index.ts`、`store.ts` | `agent/scope.py` | 作用域向下继承；同名注册由近层覆盖；注册与 effect 归属提供者；关闭等待清理，汇总清理错误 |
| `core/agent/src/index.ts`、`core/agent-loop/src/index.ts` | `session_agent.py`、`plugins/loop.py`、`scheduler.py`、`runtime/driver.py` | Agent 注册表与具体驱动分开；每个会话有独立 Context；每次执行有子作用域；卸载先取消、等待执行退出，再释放资源 |
| `core/session` | `runtime/events.py`、`session_reducer.py`、`persistence/` | 追加日志为事实源，确定性重放得到查询投影 |
| `core/system-prompt` | `runtime/context.py`、`plugins/core.py`、`prompts/system.md` | 有序、带作用域的提示词段注册；指令正文由用户维护 |
| `core/tools` | `runtime/tools.py`、`runner_tools.py`、`tools/registry.py` | 工具注册与实现分开；模型 Schema 来自实际注册；有界并行/独占调度；风险策略与确认接缝 |
| `packages/context` | `agent/context.py`、`persistence/agent_context.py` | 注入正文成为有顺序的持久会话内容，后续步骤及轮次按原位置重放 |
| `skill/skill`、`skill/skill-filesystem`、`skill/tool-skill` | `skills/registry.py`、`filesystem.py`、`context.py`、`tools/skills.py` | 注册表、来源、调用工具分开；目录仅注入名称和简介；选择后加载正文；区分模型/用户调用权限；持久目录替换与显式用户调用 |

这是 Python 的对应实现，没有引入 Cordis 的 TypeScript 运行时。尚未实现参考项目的完整事件 hook 流水线、作用域事件路由、surface 替换/压缩、PTC、多 Agent 委派、profile 配置装载及插件市场，不能宣称完整功能等价。中断恢复仍采用本项目的显式恢复与持久确认契约。

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

`ContextPreparationRegistry` 在每次模型步骤组装历史前运行带作用域的异步贡献。技能消费者重新发现目录，比较实际名称和简介列表；变化时追加 `context.injected` 完整替换，全部移除时记录空目录，不计算文件 hash。目录事件携带 `producer=skill-catalog` 和实际条目。`/技能名` 解析当前 Run 的初始用户消息及已领取的引导消息，每条消息按用户权限加载一次；正文、来源和消息身份以 `producer=skill-invocation` 持久保存。恢复同一 Run 时重放原文，不随文件编辑重写历史。

模型使用 `skill({name})` 加载正文，实际结果进入已有工具完成事件；`skill_resource({name,path})` 按需读取技能目录内的 UTF-8 资源。用户专用技能的资源仅在当前 Run 显式调用后开放。资源不允许绝对路径或越界符号链接，不执行脚本、不安装依赖。详细使用、格式、来源和接口见[Agent 技能](Agent技能.md)。远程来源、文件 watcher、插件市场和脚本执行尚未实现。

GeoSkill 的版本化地理场景逻辑放 `kunyu/scenes/`，场景数据放 `backend/scenarios/`。Tool 是执行能力，Skill 是任务指令和资源，GeoSkill 是业务场景契约。

## 上下文与历史

当前请求顺序：系统指令 → 当前 Run 冻结的工作空间/地图信息 → 按事件序号排列的会话历史（用户消息、注入内容、助手消息、工具调用及结果）。记忆不自动注入。

注入内容不会在一次请求后消失。已完成工具结果保留原值；失败/取消结果保留提交状态与错误字段。助手被中断、失败或取消时保留已经提交的文本和推理内容。尚未闭合的工具批次不构造缺失的结果，不发送不配对的 tool 消息；显式恢复后再重放已闭合批次。`/compact` 在 Agent 空闲时生成并持久化模型摘要，后续请求使用摘要与边界之后的历史。

对话页面与轨迹页面读取同一事件日志。对话的思考正文、开始/结束时间、工具运行时间均从实际事件派生；刷新后可还原。只有当前模型尝试的推理显示实时状态，已中断或取消的历史不会继续计时。

## 运行中引导

`SessionAgent.inbox` 从会话的 `agent/inbox/spliced` 日志重放 next-step 和 next-turn 两条队列。运行中发送 `steer` 保持当前 Run、模型快照和预算，不取消模型流或工具执行。受理事务持久保存消息、地图快照和幂等身份；重复请求返回同一消息。最多等待 32 条引导输入。

进入下一模型步骤时，ContextProvider 先持久领取等待输入，再运行技能等上下文贡献。领取步骤、丢弃状态和用户消息均可重放；未领取或已丢弃输入不进入模型历史。当前模型以普通 stop 结束但仍有等待输入时，先结算助手消息，再在同一个 Run 中开启新步骤。显式取消或终态失败丢弃尚未领取的输入，中断则保留它们供恢复领取。

`followup` 进入 next-turn 队列，保存未来轮次身份、模型快照、预算和调度顺序，但等待期间不创建 Run，也不进入模型历史。会话空闲时，调度器在同一数据库事务内领取首条输入并追加用户消息与 Run 事实；前一轮等待确认或恢复时，后续输入保持排队。每个会话最多一个未完成 Run，不同会话最多并发四个；全局待调度 Run 与输入总计最多 32 条。后端重启重新读取队列，执行中的 Run 中断后按显式恢复契约继续。

前端展示已受理的引导消息及“等待下一步处理”状态，领取事件到达后清除等待标记。运行中“添加到队列”保存独立后续问题；待发送面板置于输入框上方，按 mu 的宽度和行布局展示，支持删除、清空和移回输入框编辑。直接发送仍使用下一步引导。待发送输入通过 `DELETE /agent/inbox/{message_id}` 丢弃，已领取身份返回明确冲突；编辑仅在输入框为空时执行，避免覆盖草稿。显式停止和会话 Agent 释放清空等待输入，正常结束自动领取下一条。队列非空时禁止归档会话、移除工作区或更改关联模型连接。

受理响应的 `turn` 在输入等待领取时为 null，领取后查询返回真实轮次；不创建占位 Run。消息投影可保存用户输入的取消状态。开发迁移 `0003` 明确历史 inbox 的 target 并更新消息约束，SQLite 表重建期间关闭外键级联，提交前检查完整性。最终数据库仍待开发结束统一整理 SQL。

mu 草稿箱的手动发送模式、原位编辑、拖拽排序和立即发送尚未实现；生命周期 hooks、PTC 与多 Agent 委派也仍是后续对齐项。

系统指令和两个工具的描述未在本次架构改动中修改；维护入口见[记忆工具与上下文](记忆工具与上下文.md)。

## 验证

临时数据库副本通过插件组合的真实运行链路完成读取、确认、原子写入和继续回复；故意让事件提交失败时业务写入回滚，重复批准只写一次。下一轮保留注入正文与原工具结果。另核对依赖顺序/回滚、会话注册隔离、提供者卸载、活动执行取消和资源释放。

并发探针验证并行池上限、独占屏障、结果顺序、可修正工具错误及取消排空。持久引导验证一个 Run 内三次模型请求：流式响应期间受理输入，第 2 步领取并加载显式技能，执行真实记忆读取后完成；重复受理返回原消息。离屏 Electron 使用临时数据库验证浅色、深色及窄窗口的对话、思考、工具、表格和代码块展示，无横向溢出。

双队列验证三个有效输入串行完成三个 Run、四次模型请求，同会话并发上限为一；未领取输入不泄露到模型历史，删除的输入从未送入模型。关闭并重建完整插件组合后，等待输入和引导输入继续保留，显式恢复后顺序完成。旧预览数据库升级并重建投影，原 Run 与两个工具记录完整保留，外键检查无错误。离屏 Electron 验证待发送面板及实际删除 API，计数从二变为一。

`ruff check`、`compileall`、98 个后端模块导入及 `uv build` 通过；全新临时数据库的 FastAPI lifespan 启动和关闭通过。

不请求真实模型，不修改用户数据库，不新增测试文件或数据库迁移。

## 会话命令与推理参数

`CommandsPlugin` 提供作用域 `COMMANDS` 服务；定义由插件贡献，会话子作用域可以安装专属命令。API 发现当前会话定义并合并可由用户调用的 Skill；前端仅贡献 `/model` 选择面板。执行持久化 `command/run`、`command/done`，相同请求身份返回同一结果。命令结果属于会话控制记录，不自动变为用户消息；只有 `/plan <需求>` 明确受理模型轮次。

计划、权限和压缩状态来自持久事件。每个模型步骤重新读取计划提示词；写工具策略及批准路径重新检查当前权限。压缩保留原始事件，以摘要和边界替换后续模型历史。`/goal` 尚无目标状态和自主续跑服务，不注册占位命令。

推理档位及默认值来自模型列表元数据，经过目录、持久记录和 API 传到选择面板。DeepSeek 的 `off` 在适配器映射为关闭思考；其余档位按原生值发送。流式思考独立保存为 `message.assistant.reasoning.delta`，与正文共用输出预算；携带工具的请求回传历史思考。
