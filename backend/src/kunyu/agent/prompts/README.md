# 提示词编辑入口

这里保存项目自己编写、发送给模型的提示词。当前内容只从原实现移出，没有重新撰写业务指令；后续正文由项目维护者编写。Python 负责数据、参数约束和执行，不在组装时补写隐藏指导。

| 文件 | 修改内容 |
| --- | --- |
| `system.md` | 助手身份、业务定位、回答方式和行为边界 |
| `plan.md` | 计划模式指导，仅在计划模式启用时加入 System |
| `tool-guidance.yaml` | System 中的文件搜索、读取、写入操作指导；按插件是否启用贡献对应段 |
| `tools.yaml` | 20 个内置工具的模型可见说明，以及 `exit_plan_mode.plan` 参数说明 |
| `context.yaml` | 工作区／地图快照、Skill 目录和全文包装、计划切换提醒、MCP 包装、附件提示、图片省略提醒和压缩摘要包装 |
| `compaction.md` | `/compact` 和自动压缩使用的模型指令；至少保留一组不重复的 `## ` 标题，标题名称和数量可修改 |
| `tool-results.yaml` | 文件分段读取、搜索截断、图片缩放结果里的后续操作提醒 |
| `checks.yaml` | 设置页验证模型文本回答和工具调用能力的指令，不属于业务会话的 System |

Skill 本身的指令不放在这些包装文件中：

- 内置灾情研判：`../skills/bundled/disaster-assessment/SKILL.md`，配套文本在该 Skill 的 `references/`。
- 用户级 Skill：应用数据目录的 `skills/<名称>/SKILL.md`。
- 工作区级 Skill：应用数据目录的 `workspaces/<工作区 ID>/skills/<名称>/SKILL.md`。
- 桌面开发版应用数据目录为 `~/Library/Application Support/kunyu-electron/`。
- MCP 服务返回的工具说明和 instructions 来自该服务；本目录只编辑本项目的 MCP 包装文本。

## 修改与生效

直接编辑 Markdown 正文或 YAML 的文本值，保留 YAML 键名。`{{scope}}`、`{{entries}}`、`{{instructions}}` 等占位符对应程序提供的数据，必须保留原变量集合；变量可重复使用和移动位置。变量缺失、未知变量、缺失文件和空文本都会明确报错，没有默认文案兜底。

修改后重启项目。System、工具说明和新注入的上下文使用新文本；Skill 目录指导有变化时会追加替换目录。旧请求快照和旧消息保留当时的原文，不回写。压缩请求会保存当次指令与摘要包装模板，后续改文案不会使历史回放依赖新文案。

工具的参数名称、JSON Schema 类型、约束和执行权限仍在 `agent/tools/` 中定义。这些是接口契约，不能通过修改说明文案改变执行行为。工具结果中的真实数据、状态码以及用户自己的输入也不属于提示词配置。

## 模型输入顺序

参考 `deepseek-harness/packages/core/system-prompt`、`core/agent-loop` 与 `skill/tool-skill`：

1. 组装有序 System 段：身份、计划策略、工具使用指导、MCP 服务指导。
2. 独立提供工具 schema，按工具名称排序。它是请求字段，不是一条消息。
3. 保留会话消息历史以及对应的助手输出、工具调用和工具结果。
4. 追加本步骤接收的用户输入。
5. 追加变化的工作区／地图快照；内容不变时不重复追加。旧快照不被最新地图状态替换。
6. 需要时追加 Skill 替换目录，随后追加用户明确调用的 Skill 全文，使任务专用指令位于本次输入末尾。

首次调用的消息顺序是 `System → 用户问题 → 工作区快照 → Skill 目录`。工具执行后的下一次请求在原历史后追加助手工具调用和工具结果；不会把工具结果挪到历史前面。

Chat、Messages、Responses 的 wire 字段由 SDK 编码，不能把上述顺序理解为固定的 `system + skill + tool + message` 四段文本。
