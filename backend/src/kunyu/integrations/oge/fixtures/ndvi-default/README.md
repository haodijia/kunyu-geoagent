# 默认 NDVI 的一次真实录制

本目录保存 2026-10-13 的一次 NDVI 提交与结果读取过程，作为后续离线 mock 的真实数据来源。计算 POST 仅发送一次；状态查询、结果查询和文件读取均为 GET。`submission-started.json` 是持久提交标记，同一目录拒绝再次提交。

## 已确认的接口

- 提交：`POST https://openge.org.cn/api/management/gp-service/process/NDVI/api`，JSON `{}`，后端 Bearer 登录令牌。
- 状态：`GET /api/computation-api/process/{jobId}`。
- 结果：`GET /api/computation-api/process/result/{jobId}`。
- COG：`GET /api/computation-api/styles/cog/{jobId}`。
- 原始下载：`GET /api/computation-api/process/result/download/{jobId}`。

服务路径是 **gp-service**。截图所列 `api.openge.org.cn/gateway` 入口的证书不覆盖该子域名；官网前端使用 `/api`，此次使用经验证的官网 HTTPS 路由，没有关闭 TLS 校验。发现过程见 preflight.json。

## 关键事实

1. 提交约 1.57 秒，HTTP 200、业务码 20000，返回 `data.processId=job-8d0c5c44-8710-4b7d-bf0a-e237b674cb06`。
2. 状态实际观察到 resultStatus 从 0 变为 1；成功时 resultFileStatus=1、message=任务执行成功，引擎 status=success。**本 GP 服务的成功码是 1，不能套用旧手册中 2=成功的通用映射**。失败码本次未观察，不补造。服务记录的 processingTime 为 17:04:47，成功 updateTime 为 17:09:09，相隔约 4 分 22 秒。
3. 结果接口的 `data.jobId` 才是当前任务 ID；`data.processId` 是 **DAGJSON**，不能用它替换 job ID。
4. 输出文件引用在 `data.outputs.callback.info[].path`，不是直接可下载的 URL。
5. `styles/cog` 返回 **image/tiff**、支持 HTTP Range，长度 **1,030,114,824 字节**；它不是 PNG 缩略图。
6. 源栅格 15,838 × 16,098，3 波段 uint8，EPSG:32651、15 米像元、NoData=0，有 2–64 倍 overview。它是用于显示的 RGB 栅格；不能凭这些 RGB 值报告 NDVI 数值统计。
7. 栅格的 WGS84 包络约为 [119.05805, 30.63679, 121.62627, 32.86455]。包络不等同于有效像元掩膜。
8. 独立 result/download 接口的实际 GET 返回 HTTP 404、错误 JSON，不能伪造成功下载响应。

## 文件说明

- manifest.json：脱敏请求、响应状态、时间、字节数、响应文件引用与录制状态。
- submit-response.json：真实提交响应。
- status-xxxx-response.json 与 status-final-response.json：真实观察到的 0→1 状态，不补造其他状态。
- engine-probe-response.json、result-status-xxxx-response.json、result-response.json：真实引擎与结果响应。
- raster-metadata.json：原始栅格空间与波段信息，以及 mock 降采样说明。
- preview-mock.tif：由真实 COG overview 提取的 512 × 512、带相同空间范围的轻量 TIFF，用于开发展示。
- preview-mock.png：同一样例的 RGB 展示图。

完整 COG 保存在本机应用数据目录的 `oge/recordings/ndvi-default/ndvi-result.tif`，不提交 1 GB 文件到 Git。首次 COG 读取受到录制器 64 MiB 上限中断；随后用同一不可变文件的 Range 响应续传，提交计算没有重发。中断与续传均保留在 manifest 中。

## 离线重放

显式使用 `OgeReplayTransport`，未记录的请求立即报错，不连接真实 OGE。默认快速模式使用记录中的最终状态；`terminal_status=False` 可按录制顺序读取状态。没有观察到的状态不自动补造。

应用中的 NDVI mock 在提交后保持 `running` 10 秒，然后由后台监督器读取录制的最终状态并准备成果。完成时间保存在任务的下次读取时间中，应用重启后继续原计时；工具在成果准备好后返回成功，10 秒不是工具超时期限。直接使用下面的底层重放器示例不包含应用的任务计时。

COG 完整 GET 在 mock 中明确返回 **preview-mock.tif 的降采样数据**，不是原始分辨率数据；响应字节数按照轻量文件设置。原始的尺寸、字节数和实际 TIFF 类型保存在 raster-metadata.json 与 manifest 中。只对使用者明确选择的离线 mock 做这种替换，生产请求不切换数据源。

```python
from pathlib import Path
import httpx
from kunyu.integrations.oge.recording import OgeReplayTransport

case = Path("backend/src/kunyu/integrations/oge/fixtures/ndvi-default")
transport = OgeReplayTransport(case)
async with httpx.AsyncClient(transport=transport) as client:
    response = await client.post(
        "https://openge.org.cn/api/management/gp-service/process/NDVI/api",
        json={},
    )
    job_id = response.json()["data"]["processId"]
```

需要读取记录中的完整 Range 数据时，给重放器明确传入 `assets_directory`；缺少该文件时直接报错，不重新下载。当前录制未提供故障注入或伪造成功的原图下载。

录制入口为 scripts/oge_ndvi_record.py；此次大文件续传为 scripts/oge_ndvi_assets.py。collect 与大文件续传均只读，不调用计算提交接口。令牌从本机后端账号文件读取，只写脱敏记录，密码不参与录制。
