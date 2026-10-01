# 后端 Agent 结构

当前后端只发布 `kunyu` 一个 Python 包。原来的顶层 `dsh` 已移入 `kunyu.agent.runtime`，不保留旧导入路径。参考 deepseek-harness 的运行循环、工具边界和按需 Skill 加载机制，不复制它的通用插件系统。

## 当前目录与职责

```text
backend/src/kunyu/
├── agent/
│   ├── bootstrap.py          # 组合入口：创建依赖、显式注册工具与写入处理器
│   ├── session_agent.py      # 会话入口与 AgentDirectory
│   ├── scheduler.py          # 排队、并发、取消和恢复
│   ├── adapters.py           # 将持久 Run、凭据与确认服务接入运行循环
│   ├── context.py            # 系统提示词、作用域及历史组装
│   ├── prompts/system.md     # 用户维护的系统提示词
│   ├── runtime/
│   │   ├── driver.py         # 运行/取消接口
│   │   ├── models.py         # 模型消息、调用与流式输出契约
│   │   ├── tools.py          # 工具契约、Schema、风险级别和精确名称注册表
│   │   ├── context.py        # 上下文契约与提示词段落顺序
│   │   ├── runner.py         # 模型调用、预算及运行推进
│   │   ├── runner_tools.py   # 并行/独占工具调度
│   │   ├── runner_types.py   # 运行依赖与缓冲机制
│   │   ├── events.py         # 类型事件
│   │   ├── reducer.py        # Run 事件重放
│   │   ├── run_state.py      # Run 投影状态
│   │   ├── session_reducer.py
│   │   └── session_state.py
│   └── tools/
│       ├── memory.py         # 记忆读写 Schema、描述、实现和确认后的写入处理器
│       ├── registry.py       # 工具构造工厂、确认处理器注册、风险策略
│       └── shared.py         # 已有的参数、作用域与结果校验
├── api/                      # HTTP 请求、响应和错误映射
├── application/              # 工作空间、会话、模型连接、受理和确认等用例
├── domain/                   # 业务对象、错误和仓储接口
├── persistence/              # SQLite 仓储、投影、事务和迁移
└── integrations/model/       # 模型协议、网络调用和流解析
```

`runtime/` 处理模型—工具循环和事件重放，不依赖 FastAPI、SQLAlchemy、工具实现或具体模型适配器。业务工具可以调用 application/domain/persistence；运行循环通过 Protocol 使用工具，不导入记忆、地图或某个 Skill。

原来的插件内核、静态能力包装和未使用的 Memory Protocol 已移除。依赖由 `bootstrap.py` 显式构造；应用生命周期负责启动、关闭 scheduler、后台任务、HTTP client 和数据库。

## 工具如何扩展

同类工具优先一个文件，例如 `memory.py` 放记忆读写，后续 `observations.py` 放观测检索与详情。某一类确实变大时，再拆为同名目录；不要求每个小工具都独占文件。

每个工具负责自己的参数 Schema、模型可见描述、执行方式、风险级别、参数校验和调用实现。业务工具保留在 `agent/tools/`；`runtime/tools.py` 只定义共同契约。

新增工具的步骤：

1. 在对应功能文件实现工具，并声明 `ToolSpec.risk_level`。
2. 在 `bootstrap.py` 的 `builders` 中注册构造函数，注入所需服务或仓储。
3. 只读工具声明 L0；需要确认的本地写入工具声明 L2，并在 `write_handlers` 注册同名 `ConfirmedWriteHandler`。

策略从工具自身读取风险级别，不再按工具名写分支。重复工具名或缺失本地写入处理器会明确报错。工具列表和 Schema 每次通过模型请求的 `tools` 字段提供。

确认服务负责精确参数快照、批准/拒绝、事件和运行状态；具体写入由注册处理器执行。处理器接收当前 SQLAlchemy 事务，不自行提交。写入数据、工具完成结果和确认事件在同一事务中提交，失败一起回滚。

目前确认处理器用于本地事务写入。未来 OGE 等远程操作应在确认后创建持久作业，由作业服务发送和监督，不能把远程 HTTP 执行塞进 SQLite 确认事务。

## Skill 与业务场景的扩展位置

以下是后续约定，尚未实现加载器、Skill 工具或目录，不创建空壳模块。

| 内容 | 位置 | 职责 |
| --- | --- | --- |
| Skill 目录与加载逻辑 | `kunyu/agent/skills/` | 发现、校验、列出名称/描述，按需加载选定正文和资源 |
| 面向模型的 Skill 工具 | `kunyu/agent/tools/skills.py` | 定义列举/加载工具，调用 Skill 服务 |
| 随应用交付的 Skill 内容 | `backend/skills/<name>/SKILL.md` 及相邻资源 | 保存任务方法和使用说明，与 Python 实现分开 |
| GeoSkill 场景逻辑 | `kunyu/scenes/` | 校验版本化输入输出、方法约束、质量规则和业务依赖 |
| GeoSkill 场景内容 | `backend/scenarios/<name>/` | 结构化场景契约和资源，与普通 Skill 指令分开 |
| 远程业务服务 | `kunyu/application/`、`kunyu/integrations/oge/` | 任务受理、业务约束、网络调用与作业监督 |

Skill 是可复用的任务指令和资源；Tool 是可执行能力；GeoSkill 是本项目版本化的地理业务场景契约。Skill 通过已经注册的工具完成动作，不能自动注册 Python 代码、绕过工具策略或自行取得权限。

目录只提供名称和描述，完整正文在选择或加载时进入上下文。后续必须将实际加载的版本和内容记录为有顺序的会话事实，在原位置重放；不能每轮重新读取最新文件并前置到全部历史。当前一次性的 `context.injected` 不满足持久 Skill 加载语义，接入时需要落实加载事件及其历史组装，不能直接当作已实现功能。

工具和 Skill 的扩充均不应给 `runtime/runner.py` 增加业务分支。新增工作空间数据或场景数据时，继续在 domain、application 和 persistence 对应层定义统一模型和用例。

## 本次验证

- 后端模块导入、`compileall`、`ruff check backend/src` 和 `uv build --project backend` 通过。
- 检查 wheel：包含运行循环、记忆工具与系统提示词；不包含 `dsh/`、`local_tools.py` 或 `kernel.py`。
- 检查运行层导入：未依赖 FastAPI、SQLAlchemy、业务服务、仓储、工具实现或模型网络适配器。
- 在全新临时数据库中启动、关闭 FastAPI lifespan，调度器正常启动及退出。
- 在用户数据库的临时副本中用本地模型替身推进真实 Runner：读取 → 请求写入 → 等待确认 → 批准 → 后续回复完成；历史包含确认后的写入结果。
- 事件提交故意失败时记忆写入回滚；重复批准只创建一条记忆。没有请求真实模型供应商，没有修改用户数据库，没有新增测试文件或数据库迁移。
