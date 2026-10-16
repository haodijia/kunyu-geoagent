# OGE 原生算子调用核验

核验时间：2026-10-16（北京时间）。本次直接调用平台原生 `Coverage.NDVI`，没有修改应用现有的 NDVI GP 服务接入。

## 入口与鉴权

- `GET https://openge.org.cn/api/computation-api/process/info?processName=Coverage.NDVI` 可使用当前 OGE 登录 JWT 读取定义。定义类型为 Spark 算子，输入为 coverage、redBandName、nirBandName，输出字段名为 output。
- 官网工具箱执行入口为 `POST https://openge.org.cn/api/computation-api/process`，使用 `Authorization: Bearer <JWT>`。
- `/openapi/algorithm/Coverage/NDVI/execute` 属于另一套 AppKey `tk` 鉴权。登录账号的应用凭证列表为空；随后用户提供名为 oge 的 AppKey，实测此入口返回 HTTP 403、`{"code":403,"msg":"该服务未发布，无法调用"}`，未取得任务 ID。未创建或修改应用凭证，密钥不进入仓库。

## 已受理的请求格式

官网前端对 Coverage 参数发送带类型的对象，不能把 OpenAPI 手册中的协议字符串直接放进这个登录入口的 coverage 字段。

```json
{
  "name": "Coverage.NDVI",
  "dockerImageSource": "DOCKER_HUB",
  "args": {
    "coverage": {
      "type": "Coverage",
      "value": ["Platform:Coverage:LC08_L1TP_119039_20230120_20230131_02_T1:LC08_C02_L1"],
      "pretreatment": false
    },
    "redBandName": "B4",
    "nirBandName": "B5",
    "output": "kunyu-native-ndvi-20261016-035622.tif"
  }
}
```

输出任务名须唯一。本例沿用平台前端的 dockerImageSource 字段，不将其解释为算子的真实计算类型；真实任务记录为 `modelType=PLATFORM`、`algorithmName=Coverage.NDVI`。

11:56:22 提交返回 HTTP 200、业务 code=20000，processId 为 `job-4f936810-e8de-4b22-adcd-a68cbf156eee`、status=running。此前直接传字符串的请求返回业务 code=50000、Fastjson 解析错误，没有取得任务 ID；修正为官网对象格式后受理。

## 运行结果

已确认真实计算成功。状态查询 resultStatus=1、resultFileStatus=1、message=任务执行成功；成果接口返回 processId=Coverage.NDVI、status=success。该任务独立于已发布的 NDVI GP 服务。

COG Range 请求返回 HTTP 206，确认存在可读取的真实成果。元数据和三个 16×16 窗口读取结果：

| 项目 | 实测值 |
| --- | --- |
| 栅格尺寸 | 15318 × 15618 |
| 波段 / 类型 | 单波段 float32 |
| 坐标系 | EPSG:32650 |
| NoData | NaN |
| 文件大小 | 1,304,247,716 字节，使用 Range 读取，未下载完整文件 |
| 窗口 1 | 256 个有效像元，最小 0.0442193，最大 0.2903583，均值 0.1817213 |
| 窗口 2 | 256 个有效像元，最小 0.0736940，最大 0.2064611，均值 0.1361727 |
| 窗口 3 | 256 个有效像元，最小 0.0112852，最大 0.2188644，均值 0.0860874 |

这些是局部窗口抽样值，不是全图统计。该结果提供实际数值波段，与原 GP 服务的三波段 uint8 彩色显示成果不同。本次平台给 output 值再次追加 .tif，最终成果名为 kunyu-native-ndvi-20261016-035622.tif.tif；后续接入需统一输出命名。

计算成功后 COG 生成仍有延迟，首次成功查询时 bandStats 为空；随后 bandStats 及 COG 可用。

## 对项目的影响

原生 Coverage.NDVI 已通过 JWT 工具箱入口完成真实执行及数值成果读取。AppKey OpenAPI 入口因未发布而受阻，不能把两个入口的可用性混为一谈。后续可将应用的 NDVI 计算工具改接原生算子，并增加单波段数值栅格的样式与渲染；本次仅作接口核验，没有切换现有业务实现。


## 原生成果串联核验

同日继续验证 `Coverage.NDVI → Coverage.addNum(0.1)`。复用前述已成功的 NDVI，不重算上游。

下游走同一 JWT `/computation-api/process` 入口，name 为 Coverage.addNum，args 为：

```json
{
  "coverage": {
    "type": "Coverage",
    "value": ["Personal:Result:result/kunyu-native-ndvi-20261016-035622.tif.tif"],
    "pretreatment": false
  },
  "i": "0.1",
  "output": "kunyu-native-chain-file-20261016-042056.tif"
}
```

下游任务 `job-a470d970-cf30-49f6-b64a-9e0b97b4d97b` 已成功，成果仍为 15318×15618、EPSG:32650、单波段 float32，与上游网格完全相同。

用 Range 读取上下游相同的三个 16×16 窗口，共 768 个有效像元，逐像元检查 `下游 − 上游 − 0.1`，最大绝对误差为 **8.9406967×10⁻⁹**。例如上游 0.1524802446，对应下游 0.2524802387。证明上游真实数值成果已作为下游输入。

第一次同时使用 Personal:Process 作业引用和不带后缀输出名的请求，虽受理但最终 FAILED，状态接口另报“结果文件类型未定义”；未定位单独根因。不能用这个失败断言 Personal:Process 普遍不可用。后续实现优先采用本节已核验的 Personal:Result 实际文件引用及带 .tif 的输出名。

## 平台单个 DAG 组合核验

已通过平台代码执行与批处理入口完成一个包含多个原生算子的 DAG，没有发布或修改 GP 服务。

### 生成 DAG

调用 `POST /computation-api/executeCode`，JWT 鉴权，请求包含 code、当前账户 userId、唯一 sampleName。代码为：

```python
import oge
oge.initialize()
service = oge.Service()
image = service.getCoverage(
    coverageID="LC08_L1TP_119039_20230120_20230131_02_T1",
    productID="LC08_C02_L1",
)
image = service.getProcess("Coverage.toFloat").execute(image)
ndvi = service.getProcess("Coverage.NDVI").execute(image, "B4", "B5")
result = service.getProcess("Coverage.addNum").execute(ndvi, 0.1)
result.export("kunyu-native-dag-20261016-042221")
```

返回 dags 中一个 isBatch=true 的 DAG：`06839a73-5fd3-4f74-a532-bcdd0dc26173`。这是 DAG 生成阶段，不能当作计算已经完成。

### 执行 DAG

随后沿用官网任务面板的 `POST /computation-api/addTaskRecord`：id 为上述 DAG ID，crs=EPSG:32650、scale="15"、filename/taskName 为 kunyu-native-dag-20261016-042308、format=tif、source=0，附当前账户 userName 及原始 script。

返回一个后台 job：`job-66a77159-5c33-4ac4-a9f0-fbf71a8b71fe`。通过 `GET /computation-api/getState?dagId=...` 观察 running→success；引擎成果接口返回 processId=DAGJSON、status=success，实际文件为 result/kunyu-native-dag-20261016-042308.tif。整个多算子流程由这一个后台 DAG job 执行，中间结果没有经过客户端下载再上传。

### 导出核验

- `/asset/batch-result/catalog` 出现本次 DAG 的成果，记录 ID 为 `8bd37b328ab94fd2b3ef23f82c1acba6`。
- 官网批处理下载入口为 `/asset/batch-result/downloadBatchResult?id=<记录ID>&userUuid=<当前账户UUID>`，本次返回 HTTP 200、附件 kunyu-native-dag-20261016-042308.tif。
- 读取文件前 64 KiB 即可解析 BigTIFF 元数据：**15062×15362、单波段 float32、EPSG:32650、NoData=NaN**。
- 该下载入口本次忽略 Range，返回 Content-Type=multipart/form-data，但实际字节是 TIFF；读取前缀后立即关闭流，没有下载整个文件。
- 批处理 DAG 的成果不在本次标准 `/process/{jobId}` / `/styles/cog/{jobId}` 投影中：前者报暂无计算结果，后者 404。不能套用独立原生算子的成果收集路径，应使用 DAG 状态、引擎成果和批处理目录/下载入口。
- DAG 导出网格与独立 NDVI 结果不同，且批处理下载不支持 Range，因此未进行 DAG 成果与上游的逐像元等式比较。768 像元、最大误差约 9×10⁻⁹ 的结论专属于上一节的独立算子串联。

按当前官网画布编译结构尝试 `/computation-api/executeModel` 返回业务 code=50000、系统异常，尚未打通图形化 JSON 路径。这不影响上述代码生成 DAG 路径的实际成功；不据此推断任意图结构都可直接提交。

## 核验结论

1. 原生单算子已验证成功，能返回数值栅格。
2. 独立调用的算子之间能传递成果，已通过逐像元数值对比验证。
3. 平台能够执行多算子组成的单个 DAG，已验证任务成功及真实导出文件；可用路径为 executeCode 生成 DAG、addTaskRecord 提交批处理。
4. 因此可以建设原生基础工具及组合流程工具，无需为每条流程预先发布 GP 服务；两种执行方式需要各自正确处理输入与成果协议。本轮只核验接口，没有切换应用代码。
