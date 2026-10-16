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

