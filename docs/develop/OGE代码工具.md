# OGE 代码工具

更新：2026-10-19。以当前平台真实 JWT 请求和本地 deepseek-harness 的 jobs 实现为依据。

## 工具组合

| 工具 | 职责 |
| --- | --- |
| `oge_search_operators` | 从平台实时目录按名称、别名、描述检索，分页返回精简结果 |
| `oge_get_operator_definition` | 查询指定算子的真实参数顺序、类型、输出与示例代码 |
| `oge_execute_code` | 编译 Python 算子链、提交批任务、等待并收集一个栅格成果 |
| 现有影像检索、详情、预览工具 | 获取输入数据和真实波段、分辨率等信息 |
| `job_output` / `job_list` / `job_kill` | 复用通用 jobs，读取、限时等待及请求取消 |
| `map_present` / 地图上下文、样式工具 | 显式展示候选、成果，读取或调整地图 |
| 成果预览、下载工具 | 读取模型可见的 PNG 或返回源 GeoTIFF 下载引用 |

不逐个注册 614 个算子。614 是本次目录数量，工具每次查询真实平台；其中也有辅助函数，目录存在不等于全部经过执行验收。旧 `oge_calculate_ndvi` 和 GP 专用执行入口已删除，不保留运行回放分支。

## 输入与代码

执行代码直接接收真实 OGE `image_id`，服务器通过影像详情接口解析 coverageID 和 productID，不要求影像先绑定当前会话的候选集。省略 image_id 时自动使用本轮输入时冻结的地图选景；两者都没有时 selected_image 为 null，脚本自行加载输入。候选集仍服务于地图展示和选景交互，不再作为执行代码的前置条件。

代码运行在 OGE，服务器只将以下已解析的数据注入远端脚本；不在用户电脑执行模型生成的 Python：

```python
selected_image = {"coverageID": "实际 imageIdentification", "productID": "实际 productName"}
```

一个经过定义查询后的 Landsat NDVI 代码结构如下；其他产品必须使用实际波段名：

```python
import oge
oge.initialize()
service = oge.Service()
image = service.getCoverage(
    coverageID=selected_image["coverageID"],
    productID=selected_image["productID"],
)
image = service.getProcess("Coverage.toFloat").execute(image)
result = service.getProcess("Coverage.NDVI").execute(image, "B4", "B5")
result.export("analysis")
```

工具参数还包括 `title`、输出 `crs`、`scale`，以及可选的 `display_range=[min,max]`。代码与参数经过现有 L2 审批。数据、脚本、编译 DAG ID、编译日志和远端 job ID 保存在 AnalysisJob 中。

当前每次调用需要且仅支持一个批量 Coverage 导出，可以在导出前组合多个算子。不支持向量、多个导出、无导出的日志脚本；这些情况在提交批任务前明确报错。上图支持单波段实数栅格、三波段 uint8 / uint16 RGB；其他输出类型明确报错。

## 实际执行协议

1. `POST /computation-api/executeCode`：JWT；请求 `code/userId/sampleName`。这里返回原始 `dags/log` 对象，不能按通用 `code=20000` 包装解析。`userId` 来自当前登录 JWT 的 uuid，仅用于绑定身份，鉴权仍由平台完成。
2. 校验一个 batch `exportCoverage` DAG，持久保存 DAG ID 和日志。编译与批任务提交在同一进程内串行，避免本应用会话交错修改用户的远端解释器状态。
3. `POST /computation-api/addTaskRecord`：提交 DAG ID、原脚本、账号名、任务名、CRS、分辨率和 TIFF 文件名。平台成功码是 200，返回远端 job ID。输出文件名使用可读时间戳。
4. `GET /computation-api/getState?dagId=...`：返回原始文本 running / success。已知失败状态明确终止；未知状态报错，不猜测成功。
5. `GET /computation-api/process/result/{jobId}`：校验匹配的 job 身份与成功结果。明确的 result-not-ready 保持 collecting；FAILED 作为失败处理。
6. `GET /asset/batch-result/catalog`：按 DAG ID、文件名及当前用户 UUID 匹配发布成果。计算成功但目录尚未发布时保持 collecting。
7. `GET /asset/batch-result/downloadBatchResult?id=...&userUuid=...`：流式下载，2 GiB 上限，临时文件写完后原子发布。真实返回虽然标为 multipart/form-data，内容是 TIFF，因此校验 TIFF/BigTIFF 魔数并通过 rasterio 读取；不依赖错误的 Content-Type，不使用其不支持的 Range。

此批任务流程不使用 `/styles/cog/{jobId}`：已验证这个入口对代码 DAG 成果返回 404。源 GeoTIFF 下载后，本地生成 PNG 预览和 Web Mercator 瓦片。

网络中断、响应不确定或应用在提交中退出，保留 submission_unknown，不自动重发计算请求。已提交任务由监督器继续查询；恢复原账号后可继续读取。旧 GP 未完成任务不能由新协议继续执行，会明确标记服务已移除。

## jobs 与地图

提交后登记现有会话所属 job，前台先等待 120 秒，到期返回同一个 job ID。远端继续计算，模型通过 `job_output(wait=true)` 有限等待；默认 30 秒，最长 10 分钟。尚未结束仍返回 running。未交付的完成通过既有通知注入忙碌 Agent，或唤醒空闲 Agent。

通用 job 与 AnalysisJob 使用同一个稳定 ID，避免模型把成果任务 ID 传给后台结果工具时找不到任务。任务通过通用 `job/changed` 事件关联发起工具，对话和轨迹在原工具行显示运行、完成或失败；输入区不单独展示后台任务面板。

不新增业务等待工具。远端取消尚无经过验证的接口，取消请求明确拒绝，不把“停止本地等待”描述为停止远端计算。通用 jobs 仍为进程内任务；持久 AnalysisJob 和成果收集可跨应用重启恢复，进程内完成通知不宣称跨重启恢复。

完成后返回精简的任务、成果引用与栅格元数据，不将脚本和大文件塞进终态工具结果。Agent 再用 `map_present` 请求展示；计算完成本身不切页、不自动添加图层。

单波段使用固定色带和全图一致的显示值域：调用方可明确指定，未指定则取预览采样的 2% / 98% 分位数。这仅控制显示，不改动源像元；透明掩膜处理 NoData 和非有限值。下载源 GeoTIFF，保留 float32 等数值类型。UI 显示数值栅格说明、色带和值域，删除旧默认 NDVI / RGB 演示入口和固定产品限制。

RGB 的预览与瓦片使用同一份逐波段显示范围。uint16 可指定统一 `display_range`，省略时按各波段预览采样的 2% / 98% 分位数拉伸；uint8 未指定范围时保持 0–255。显示范围写入成果元数据，源 GeoTIFF 不转为 uint8，下载保留原始像元类型和值。

## 本次验证

- 真实执行 `Coverage.toFloat → Coverage.NDVI → Coverage.addNum(0.1) → Coverage.clip`，Geometry.Polygon 裁剪约 1 km 范围；调用前读取真实 Geometry 和 Coverage 定义。
- 远端 job：`job-91300d9e-ca09-445c-810a-1263576cdaf8`；DAG：`aeef72e6-c5ae-413b-853d-0dc87c1947d3`。
- 使用实际 AnalysisService / AnalysisSupervisor 从提交推进到 succeeded，并经真实批成果目录下载；没有重复提交。
- 结果为 128 × 128、单波段 float32、EPSG:32650，含裁剪外 NoData 和 1089 个有效像元；有效值约 0.08039–0.41527，文件 266240 字节。输出范围包含平台导出的对齐边界，不等于只有请求矩形大小。
- 已读取真实像元，并生成 PNG 预览和地图瓦片。应用启动、三个工具注册及参数校验、改动文件 Ruff、前端类型检查与构建通过。实际地图展示无页面运行错误，下载得到完整 266240 字节源文件；按项目要求不新增测试文件。

代码入口：`agent/tools/oge/execute_code.py`、`operators.py`、`application/analysis/analysis.py`、`integrations/oge/execution.py`、`integrations/geospatial/analysis_raster.py`。既有数据库结构无需改动，历史任务和成果仍可查看。
