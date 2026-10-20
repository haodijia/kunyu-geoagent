# Agent 技能

技能是 Markdown 任务指令和相邻资源，执行能力仍由 Tool 提供。实现参考 `deepseek-harness/packages/skill` 的注册表、文件系统来源、调用权限、持久目录和按需加载机制。

## 使用

在「设置 → 技能」中新建、编辑用户技能，或输入本地目录 / Markdown 文件路径导入。目录必须包含 `SKILL.md`，导入时复制整个资源目录；单文件导入只复制指令文件。目录最多 200 个文件、10 MiB，不接受符号链接。外部和内置技能在设置页只读，需在来源目录维护。

会话输入框的「技能」菜单只显示允许用户调用的技能，选择后将 `/技能名` 插入消息开头。例如：

```text
/disaster-assessment 根据我提供的材料整理灾情研判
```

也可以在消息任意位置使用空白分隔的 `/技能名`，一条消息可加载多个技能。成功加载的名称在用户消息中显示为可点击标记；标题栏按 Mu 展示已加载数量和列表，点击查看本次加载的指令快照。普通路径、未知名称及未获用户调用权限的名称保持普通文本。

模型可以根据技能简介主动调用 `skill` 工具。技能加载和资源读取使用现有工具调用展示；目录和用户调用在轨迹页分别显示为「技能目录」与「用户调用技能」。标题栏汇总真实用户调用和成功的模型加载，刷新后从持久事件恢复。无需数据库迁移。

随应用提供的 `disaster-assessment` 技能包含研判流程和简报模板。它根据实际输入整理事实、推断、缺失证据和核查计划，不会声称执行未提供的空间计算或数据查询。

## 格式

```markdown
---
name: my-skill
description: 描述用途和明确的触发条件
whenToUse: 可选的适用任务和输入场景
disable-model-invocation: false
user-invocable: true
---

# 任务指令

1. 明确目标和输入。
2. 按需读取 references/guide.md。
3. 给出结果、依据和下一步行动。
```

名称使用小写字母、数字和连字符。必须有非空 `description` 和 Markdown 正文。简介最长 2000 字符，模型目录中的规范化简介默认最多 500 个 UTF-16 单元，超出时用 `...` 标明截断，并保留完整 Unicode 字符。通过 `SkillToolsPlugin(catalog_description_max_length=...)` 显式配置，最小为 3。指令和单个文本资源最多 128 KiB，读取正文不会截断。

`whenToUse` 是可选的非空文本，最长 2000 字符；它在设置、会话技能目录和斜杠菜单中作为独立的 `when_to_use` 字段提供，搜索可匹配适用场景。模型目录继续只发布名称和简介。

调用控制使用准确的 YAML kebab-case 键，值必须是布尔值；旧形式的控制键会报错。省略控制项时允许两种调用。

| disable-model-invocation | user-invocable | 行为 |
| --- | --- | --- |
| false | true | 模型主动调用和用户显式调用均允许 |
| true | true | 仅用户 `/技能名` 调用 |
| false | false | 仅模型主动调用 |
| true | false | 两种调用均关闭，设置页仍可查看和编辑 |

目录支持直属 `<name>/SKILL.md` 和直属 `<name>.md`，不递归寻找深层 `SKILL.md`。同一来源目录的重复名称直接报错。

## 来源和优先级

设 `APP_DATA` 为应用数据目录，可通过 `KUNYU_APP_DATA_DIR` 设置。

| Rank | 来源 | 路径 |
| --- | --- | --- |
| 100 | workspace | `APP_DATA/workspaces/<workspace_id>/skills` |
| 250 | runtime | 应用插件或会话作用域直接注册，无需文件 |
| 400 | user | `APP_DATA/skills` |
| 500 | user-agents | `~/.agents/skills` |
| 600 | bundled | `backend/src/kunyu/agent/skills/bundled` |

本项目的 Workspace 是业务工作区，尚无文件系统 cwd。因此使用工作区专属数据目录，不推断用户项目或 Git 根目录。工作区来源只在相应会话可见；全局设置页展示用户、外部用户和内置来源。

同层低 rank 获胜；会话作用域 Provider 的同名条目覆盖祖先作用域。全局设置页和会话目录均由同一注册表查询，会话目录查询不启动模型或创建 SessionAgent。

每次模型步骤和目录请求重新发现文件，外部修改无需重启。无法读取或格式错误的技能会使本次目录查询明确失败，并记录日志；不静默忽略错误，不保留旧目录作为降级结果。

## 加载、资源与历史

模型目录只包含名称和简介，不包含正文和绝对路径。`skill({name})` 在调用时检查模型权限并读取完整正文。结构化结果包含来源、资源目录和原始 Markdown 正文；实际模型工具文本使用与用户显式调用相同的 `<skill_content>` 包裹，不把指令编码成嵌套 JSON 字符串。两部分作为实际工具结果持久保存。

技能资源沿用普通文件工具：`skill({name})` 返回真实资源目录，Agent 将技能中的相对路径拼到该目录后调用 `read({file_path})`，图片使用 `read_image`，查找使用 `glob`／`grep`。文件服务与技能发现共用目录配置，允许读取当前工作区技能、应用用户技能、`~/.agents/skills` 和内置技能；这些绝对路径只读，工作区外其他目录不可读，符号链接不能越出开放目录。相对文件路径仍以 `/workspace` 为基准。技能加载权限仍由技能服务检查，普通文件读取遵守目录权限。

技能加载不会执行 `scripts/` 中的脚本，不安装依赖，也不自动枚举资源。图片由通用图片读取工具处理。

初次非空目录和后续目录变化保存为带 `producer=skill-catalog` 的 `context.injected` 事件，替换内容也可以为空。仅当当前作用域的 `skill` 工具仍为技能插件注册的实例时发布模型目录；被同名工具替换时发布空目录，恢复原工具后重新发布。历史压缩移除可见目录后，即使条目未变也重新发布。比较实际条目列表，不给文件添加 hash。

显式调用只扫描当前步骤已接纳的真实用户消息，`/技能名` 前后必须是空白或消息边界。按首次出现顺序加载，同一步内重复名称只加载一次；未知、模型专用名称、`/usr/bin`、`5/8` 和紧贴标点的 `/name。` 不触发。处理器补充的上下文消息及系统注入不能伪造用户授权。

实际指令与技能名称、来源、用户消息身份、Run 和 step 保存为 `producer=skill-invocation` 的注入事件。同一步恢复或重试不再次加载；后续步骤中的新用户调用可以重新加载。后续文件编辑、删除不改写历史正文，对话中的 Markdown 预览直接展示持久化快照。用户调用的 `metadata.content` 保存原始正文，模型-facing 包裹只用于模型消息，UI 无需解析提示词结构。模型加载的结构化 `result.content` 同样是原始正文。已加载列表、消息标记和复制均使用这些实际快照。

0020 为旧用户调用记录补充包裹中已确定的指令正文，原模型消息、旧工具结果、事件序号和用量不变；无法确认原包裹时升级明确失败，不猜历史文件内容。旧模型工具返回仍保留其当时实际记录，不改造成新工具返回。新建技能模板使用实际多行 YAML，名称修改同步更新 frontmatter，可直接保存。

## 接口

接口沿用桌面会话鉴权。

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/api/v1/skills` | 全局目录和用户技能目录路径 |
| POST | `/api/v1/skills` | 新建用户技能，`{name, content}` |
| POST | `/api/v1/skills/import` | 从本地路径导入，`{path}` |
| GET | `/api/v1/skills/{name}` | 查看元数据、正文和原始文件 |
| PUT | `/api/v1/skills/{name}` | 保存可编辑用户技能，`{content}` |
| DELETE | `/api/v1/skills/{name}` | 删除用户技能包及其资源 |
| GET | `/api/v1/sessions/{session_id}/skills` | 该会话允许用户调用的目录 |

新增来源实现 `SkillProvider.list/get`，通过 `SKILLS.register_provider(owner, name, provider)` 注册，返回幂等释放函数；Provider 随 owner 释放，未完成的发现和正文读取同步取消，卸载后的结果不可被接纳。`locator` 是 Provider 自己解释的不透明值，不再等同于文件路径；可选 `path` 仅描述实际指令文件。服务定义、来源和消费工具是三个独立插件，在 `bootstrap.py` 选择组合。

## 运行时技能与资源位置

应用或业务插件通过 `SKILLS.register(owner, SkillRegistration(...))` 直接贡献 Markdown 和资源位置，无需生成 SKILL.md。注册返回幂等释放函数；同一作用域的同名运行时贡献按 harness 保留第一项，重复注册记录警告，重复项的释放函数不会移除原贡献。会话作用域只影响该会话；同层项目来源 rank 100 优先于运行时 rank 250，运行时优先于用户 rank 400。同 rank 时运行时贡献优先于普通 Provider，普通 Provider 保留注册顺序。

```python
from kunyu.agent.core import services as s
from kunyu.agent.skills.definitions import OpaqueResourceBase, SkillRegistration

dispose = context.require(s.SKILLS).register(
    context,
    SkillRegistration(
        name="evidence-review",
        description="核对当前业务场景的证据来源与研判口径",
        content=scene.instructions,
        resource_base=OpaqueResourceBase(description="当前场景参考资料"),
    ),
)
```

运行时指令在注册时验证；参考资料由贡献方放在真实可读位置，注册表不提供虚拟文件读取接口。`resource_base` 可为 directory／url／opaque 或 None，分别说明真实目录、来源地址、业务资料描述或所属 Provider。目录资源使用通用文件工具；资源位置本身不会授予任意目录权限，也不会自动发起网络请求。非文件来源通过其明确提供的通用资源工具访问。

发现和加载期间若当前可见注册发生变化，返回 SKILL_CATALOG_CHANGED，调用方重新查询；兄弟会话的变化不干扰本次读取。已经完成加载的指令与工具结果仍是持久快照，释放来源不会改写历史。运行时注册本身不写入数据库，应用重启后由贡献插件重新注册。

全局详情和会话目录共用上述注册表。接口新增 Provider 身份，真实文件路径可空；资源位置为带 kind 的对象。虚拟技能的 path／raw 为 None，详情只读并复用 Markdown 展示，不伪造文件路径或可编辑 SKILL.md。文件来源的用户技能继续提供原始文件编辑，外部和内置技能只读预览。当前模型／用户调用权限、目录重发和显式调用去重规则均继续生效。

临时实际 Agent／ASGI 验证了 Chat、Messages、Responses 的运行时加载、通用文件资源读取、用户权限、目录压缩后重发和完整历史重建；作用域覆盖、优先级、重复注册、取消、来源替换和遍历拒绝通过。离屏 Electron 核对只读 Markdown、真实资源说明、用户编辑、刷新、浅色和 600px 深色布局；前后端构建、Ruff 和 Python 包构建通过。未新增仓库测试文件或数据库迁移，未调用真实付费模型。文件 watcher、远程来源默认接入、脚本执行和其余 Agent 能力仍未实现。
