# OGE OpenAPI 接口清单


成功时 HTTP 多为 200，业务码 `code=20000`，数据在 `data`。`msg` 可能是空字符串、`获取成功`、`操作成功`，不要写死「成功」。失败时 `code` 非 0（常见 `40000` / `40003` / `50000`）；`/openapi/**` 缺 tk 或 tk 无效时 **HTTP 401**，body 仍是 JSON。

```powershell
$resp = Invoke-WebRequest -Method POST -Uri $uri -ContentType "application/json" -Body $body -UseBasicParsing
[System.Text.Encoding]::UTF8.GetString($resp.RawContentStream.ToArray())
```

| 场景 | 凭证 | 携带方式 |
|------|------|----------|
| 登录 | 无 | — |
| 产品列表、产品影像 | 实测可不带 JWT | — |
| 上传 / 我的数据 / 算子定义 / 状态 / 结果 / AppKey | 用户 JWT | `Authorization: Bearer <token>` |
| 执行算子、执行组合模型（`/openapi/**`） | 应用凭证 `tk`（`apk.` 前缀） | Query `?tk=apk.xxx` 或 Header `tk: apk.xxx` |

无 JWT 访问需登录接口：`{"code":40003,"msg":"无效token","data":null}`。

---

## 实测勘误

| 手册写法 | 线上实测 |
|----------|----------|
| 登录 `expiresIn=7200`，`msg=成功` | `expiresIn=43200`（12 小时），`msg` 为空字符串 |
| AppKey：`/open/app/key/create`、`/open/app/key/industries` | **HTTP 404**。正确前缀：`/management/open/app/key/...` |
| `industryIds` 示例 `[1,5]` | 行业 id 从 **257** 起（公共管理 257、公共安全 258 … 共 33 条） |
| 算子定义 `output.name=outputName`，`type=2`，`args` 为对象 | 三个示例算子均为 `output.name=output`，`type=1`，`args` 为 **数组** |
| 执行 body 里 coverage 写成字符串 | `Coverage` 类型须写成对象：`{"type":"Coverage","id":"Platform:Coverage:..."}`（字符串会 fastjson 报错） |
| 产品 `id=5070`、`LC09_C02_L2` | `LC09_C02_L2` 的 id 是 **456**；`5070` 返回 `imageProductDTO is not exist` |
| 影像 `LC81220392015275LGN00` + 产品 `LC09_C02_L2` | 该标识是 Landsat 8，与 LC09 产品对不上。LC09 示例用 `LC09_L2SP_001027_20260109_20260110_02_T1` |
| 已发布算法含 `Coverage.terrSlope` 等 | 当前只发布 **`Coverage.terrAspect`**。`terrSlope` / `NDVI` 执行返回 HTTP 403「该服务未发布，无法调用」 |
| 组合模型「坡度分析模型」 | `坡度分析模型`、`FC_Filter_EQ` 执行 403 未发布；`ship_detect_GP1` 能提交 job，响应是裸 `{processId}`（无 `code/msg/data` 包装） |
| 手册 4.0：第三方可用 `tk` 查状态 | 登录拿到的 JWT 即可查（已实测）。只带 `tk`、不带登录 token 会 `40003`，手册这条不成立 |
| `resultStatus=2` 表示成功 | `2` 表示任务结束。算子内部失败时仍是 `2`，错误在 `data.message` |
| 状态查询固定返回 `resultStatus` 结构 | 任务不存在时：`{"code":50000,"msg":"查询状态成功，暂无计算结果！","data":false}` |
| 产品列表必须 JWT | **不带 JWT 也能** `20000` |
| 执行成功还带 `taskName`、`status` | 实测成功体只有 `data.processId` |

2026-10-05 已登录拿 JWT，并用有效 `tk` 提交 `terrAspect`。状态和结果接口用的就是这次登录的 token。

---

## 5.1 接口一览

| 功能 | 方法 | 路径（相对网关 Base URL） | 鉴权 |
|------|------|---------------------------|------|
| 登录 | POST | `/oauth/token`（query：`scopes=web`、`client_id`、`client_secret`、`grant_type=password`；body：`username`、`password` 明文） | 无 |
| 上传数据 | POST | `/asset/myData/upload`（multipart：`file`、`assetName`、`assetType`、`dataType`、`phenomenonTime`、`belongingArea`、`productLevel`、`productResolution`） | JWT |
| 我的数据列表 | POST | `/asset/myData/list`（JSON：`pageNumber`、`pageSize`、`keywords`、`dataType`） | JWT |
| 产品列表 | POST | `/data-product/page`（JSON：`pageNum`、`pageSize`、`type` 0 影像 / 1 矢量、`keywords`、`status=1`） | 可无 |
| 产品影像列表 | GET | `/data-product/image/listByProductId?productId=`（大产品务必加 `imageIdentification`；也可用 `/data-product/image/pageByProductId`） | 可无 |
| 算子定义 | GET | `/computation-api/process/info?processName=Coverage.terrSlope` | JWT |
| 执行算子 | POST | `/openapi/algorithm/{包}/{算子}/execute`（JSON body = 算子 args；需带 `tk`） | tk |
| 执行状态 | GET | `/computation-api/process/{processId}` | JWT |
| 执行结果 | GET | `/computation-api/process/result/{processId}` | JWT |
| 结果下载 | GET | `/computation-api/process/result/download/{processId}` | JWT |
| COG 预览 | GET | `/computation-api/styles/cog/{processId}` | JWT |
| 注册 AppKey | POST | `/management/open/app/key/create`（JSON：`appName`、`industryIds`、`whitelist`） | JWT |
| 行业类别列表 | GET | `/management/open/app/key/industries` | JWT |
| 执行组合模型 | POST | `/openapi/combination/{serviceName}/execute`（JSON body = 模型参数；需带 `tk`） | tk |

---

## 公共约定

### 输入数据引用

`Coverage` 类型参数不要只写字符串。OpenAPI 执行时写成对象，`id` 用下面协议：

| 来源 | `id` 格式 |
|------|-----------|
| 我的数据 | `Personal:MyData:myData/{文件名}` |
| 个人资产 | `Personal:Asset:{assetUuid}` |
| 我的处理结果 | `Personal:Process:{processId}` |
| 平台单景影像 | `Platform:Coverage:{imageIdentification}:{productName}` |
| 平台产品影像集合 | `Platform:Product:Coverage:{productName}:{imageId1,imageId2}` |
| 平台产品 | `Platform:Product:{productName}` |
| 天地图在线 | `Tms:{tileUrl}` |

文件名 = `assetName` + `.` + `assetExt`。

### 输出文件名

执行 body 必须带输出文件名，键 = 算子定义 `output.name`。三个实测算子都是 **`output`**，不是手册里的 `outputName`。同一用户下不能重名。

### 推荐调用顺序

1. `POST /oauth/token` 登录拿 JWT  
2. `GET /management/open/app/key/industries` → `POST /management/open/app/key/create` 申请 `tk`  
3. 选数据：上传，或产品/影像引用  
4. `GET /computation-api/process/info?processName=` 看 args 与 `output.name`  
5. `POST /openapi/algorithm/{包}/{算子}/execute?tk=`（仅已发布服务）  
6. `GET /computation-api/process/{processId}`  
7. 结果：`/process/result/{processId}`、`/process/result/download/{processId}`、`/styles/cog/{processId}`

---

## 1. 登录

**API：** `POST /oauth/token`  
**鉴权：** 无  
**Content-Type：** `multipart/form-data`（PowerShell 哈希表会发成表单，可用）

### 输入（参数）

| 参数 | 位置 | 必填 | 说明 |
|------|------|------|------|
| grant_type | query | 是 | 固定 `password` |
| client_id | query | 是 | 默认 `test` |
| client_secret | query | 是 | 默认 `123456` |
| scopes | query | 是 | 固定 `web` |
| username | body | 是 | 平台账号 |
| password | body | 是 | 明文。连续错误 5 次锁定 |

### 调用

```powershell
Invoke-RestMethod -Method POST `
  -Uri "http://openge.org.cn/api/oauth/token?scopes=web&client_secret=123456&client_id=test&grant_type=password" `
  -Body @{ username = "<账号>"; password = "<明文密码>" }
```

### 输出

| 字段 | 位置 | 实测值/说明 |
|------|------|-------------|
| code | 根 | `20000` |
| msg | 根 | 空字符串（手册写「成功」） |
| token | data | JWT，约 460 字符 |
| refreshToken | data | 刷新令牌 |
| tokenHead | data | `Bearer `（末尾空格） |
| expiresIn | data | **43200**（手册写 7200） |
| exp | data | 过期 Unix 秒 |
| refreshExpiresIn | data | 2592000 |
| refreshExp | data | 刷新过期 Unix 秒 |

```json
{
  "code": 20000,
  "msg": "",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "tokenHead": "Bearer ",
    "expiresIn": 43200,
    "exp": 1791217163,
    "refreshExpiresIn": 2592000,
    "refreshExp": 1793765963
  }
}
```

缺 username/password：

```json
{ "code": 40000, "msg": "参数为空", "data": null }
```

账号或密码错误：`code=50000`，文案含剩余失败次数。

---

## 2. 上传数据

**API：** `POST /asset/myData/upload`  
**鉴权：** JWT  
**Content-Type：** `multipart/form-data`

本次未实际上传文件（避免往账号里写数据）。无 JWT 时实测 `40003`。

### 输入

| 表单字段 | 位置 | 必填 | 说明 |
|----------|------|------|------|
| file | body | 是 | tif / geojson 等 |
| assetName | body | 是 | 不带后缀 |
| assetType | body | 否 | 如 `mydata` |
| dataType | body | 是 | `grid` / `vector` |
| phenomenonTime | body | 否 | `yyyy-MM-dd` |
| belongingArea | body | 否 | 所属区域 |
| productLevel | body | 否 | 如 `L1T` |
| productResolution | body | 否 | 分辨率 |
| assetUuid | body | 否 | 留空由平台生成 |

### 调用

```powershell
$headers = @{ Authorization = "Bearer <token>" }
Invoke-RestMethod -Method POST `
  -Uri "http://openge.org.cn/api/asset/myData/upload" `
  -Headers $headers `
  -Form @{
    file     = Get-Item "C:\data\data.tif"
    assetName = "data"
    assetType = "mydata"
    dataType  = "grid"
  }
```

### 输出

成功：

```json
{ "code": 20000, "msg": "成功", "data": true }
```

无 JWT：

```json
{ "code": 40003, "msg": "无效token", "data": null }
```

成功后引用：`Personal:MyData:myData/{assetName}.{assetExt}`。

---

## 3. 我的数据列表

**API：** `POST /asset/myData/list`  
**鉴权：** JWT  
**Content-Type：** `application/json`

### 输入

| 参数 | 位置 | 必填 | 说明 |
|------|------|------|------|
| pageNumber | body | 否 | 默认 1 |
| pageSize | body | 否 | 默认 10 |
| keywords | body | 否 | 模糊查询 |
| dataType | body | 否 | `grid` / `vector` |
| assetStatus | body | 否 | 状态 |
| startTime / endTime | body | 否 | 时间范围 |

### 调用

```powershell
$headers = @{ Authorization = "Bearer <token>" }
$body = @{ pageNumber = 1; pageSize = 10 } | ConvertTo-Json -Compress
Invoke-RestMethod -Method POST `
  -Uri "http://openge.org.cn/api/asset/myData/list" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body $body
```

### 输出

```json
{
  "code": 20000,
  "msg": "操作成功",
  "data": {
    "pages": 0,
    "currentPage": 1,
    "total": 0,
    "pageSize": 5,
    "records": []
  }
}
```

有数据时 `records[]` 字段：

| 字段 | 说明 |
|------|------|
| assetId | 资产 id |
| assetUuid | 用于 `Personal:Asset:{assetUuid}` |
| assetName / assetExt | 文件名 = 二者拼接 |
| assetSize | 字节 |
| dataType | `grid` / `vector` |
| assetStatus | 如 `normal` |
| uploadTime | 上传时间 |

```json
{
  "code": 20000,
  "msg": "成功",
  "data": {
    "pages": 2,
    "currentPage": 1,
    "total": 12,
    "pageSize": 10,
    "records": [
      {
        "assetId": 1001,
        "assetUuid": "...",
        "assetName": "data",
        "assetExt": "tif",
        "assetSize": 1048576,
        "dataType": "grid",
        "assetStatus": "normal",
        "uploadTime": "2026-08-06 10:00:00"
      }
    ]
  }
}
```

---

## 4. 产品列表

**API：** `POST /data-product/page`  
**鉴权：** 实测可不带 JWT  
**Content-Type：** `application/json`

### 输入

| 参数 | 位置 | 必填 | 说明 |
|------|------|------|------|
| pageNum | body | 否 | 默认 1 |
| pageSize | body | 否 | 默认 10 |
| type | body | 否 | `0` 影像，`1` 矢量（另有样本集等） |
| keywords / name | body | 否 | 模糊查询 |
| status | body | 否 | `1` 已发布 |
| sortType / isSortDesc | body | 否 | 排序 |

### 调用

```powershell
$body = @{ pageNum = 1; pageSize = 2; type = 0; status = 1 } | ConvertTo-Json -Compress
Invoke-RestMethod -Method POST `
  -Uri "http://openge.org.cn/api/data-product/page" `
  -ContentType "application/json" `
  -Body $body
```

### 输出

`data.total=60`，`pages=30`。`records[]` 字段远多于手册，包括 `aliasEn`、`description`、`coverImage`、`timeFrame`、`area` 等。

| 字段 | 说明 |
|------|------|
| id | 产品 id，查影像列表用 |
| type | `0` 影像 |
| name | 产品名，拼 Coverage `id` 用 |
| alias | 中文别名 |
| status | `1` 已发布 |

```json
{
  "code": 20000,
  "msg": "获取成功",
  "data": {
    "pages": 30,
    "currentPage": 1,
    "total": 60,
    "pageSize": 2,
    "records": [
      {
        "id": 513,
        "type": 0,
        "name": "MODIS09Q1",
        "alias": "MODIS 8天合成250米分辨率地表反射率产品",
        "status": 1
      }
    ]
  }
}
```

`keywords=LC09` 时两条：`id=454` `LC09_C02_L1`，`id=456` `LC09_C02_L2`。手册里的 `id=5070` 线上不存在。

---

## 5. 产品影像列表

**API：** `GET /data-product/image/listByProductId`  
**鉴权：** 实测可不带 JWT

大产品（如 ASTER 2 万景、LC09 约 7.8 万景）不要无过滤全量拉取，会很慢。用 `imageIdentification` 过滤，或改用分页：

`GET /data-product/image/pageByProductId?productId=456&pageNum=1&pageSize=1`

### 输入（参数）

| 参数 | 位置 | 必填 | 说明 |
|------|------|------|------|
| productId | query | 是 | 产品 id，如 LC09_C02_L2 = **456** |
| imageIdentification | query | 建议 | 影像标识过滤 |
| pageNum / pageSize | query | 分页接口必填语义 | 仅 `pageByProductId` |

### 调用

```powershell
Invoke-RestMethod -Method GET `
  -Uri "http://openge.org.cn/api/data-product/image/pageByProductId?productId=456&pageNum=1&pageSize=1"
```

DEM 过滤：

```powershell
Invoke-RestMethod -Method GET `
  -Uri "http://openge.org.cn/api/data-product/image/listByProductId?productId=124&imageIdentification=ASTGTM_N18E109"
```

### 输出（实测分页，productId=456）

`msg` 可能为空。单条字段比手册多（四角坐标、`bands`、`geomWkt`、`productName` 等）。

| 字段 | 说明 |
|------|------|
| imageId | 影像 id |
| productId | 产品 id |
| imageIdentification | 景标识，拼 Coverage `id` 用 |
| productName | 产品名 |
| crs | 坐标系 |
| phenomenonTime | 成像日期 |
| coverCloud | 云量 |
| upperLeftLong / upperLeftLat | 左上角 |

```json
{
  "code": 20000,
  "msg": "",
  "data": {
    "pages": 78944,
    "currentPage": 1,
    "total": 78944,
    "pageSize": 1,
    "records": [
      {
        "imageId": 3461318,
        "productId": 456,
        "imageIdentification": "LC09_L2SP_001027_20260109_20260110_02_T1",
        "crs": "EPSG:32622",
        "phenomenonTime": "2026-01-09",
        "coverCloud": 66.14,
        "upperLeftLong": -53.9512254132,
        "upperLeftLat": 48.4966949736,
        "productName": "LC09_C02_L2"
      }
    ]
  }
}
```

DEM 过滤示例：`productId=124` + `imageIdentification=ASTGTM_N18E109` → 引用  
`Platform:Coverage:ASTGTM_N18E109:ASTER_GDEM_DEM30`。

`listByProductId` 无分页时 `data` 直接是数组（ASTER `productId=124` 全量约 22466 条）。

---

## 6. 算子定义

**API：** `GET /computation-api/process/info`  
**鉴权：** JWT（无 token → `40003`）

`processName` = `{包}.{算子}`。返回的 `args` 是 **数组**；`output.name` 是执行 body 里输出文件名的键。三个示例都是 `output`，`type=1`。

### 输入（参数）

| 参数 | 位置 | 必填 | 说明 |
|------|------|------|------|
| processName | query | 是 | 如 `Coverage.terrSlope` |

无 JWT：

```json
{ "code": 40003, "msg": "无效token", "data": null }
```

### 示例 A：`Coverage.terrSlope`（id=437，地形坡度）

#### 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| coverage | Coverage | 是 | DEM |
| radius | Integer | 是 | 邻域半径，默认 `1`（3×3） |
| zFactor | Double | 否 | 高程换算，默认 `1.0` |
| output | String | 是 | 定义里的输出键，值为结果文件名 |

#### 调用

```powershell
$headers = @{ Authorization = "Bearer <token>" }
Invoke-RestMethod -Method GET `
  -Uri "http://openge.org.cn/api/computation-api/process/info?processName=Coverage.terrSlope" `
  -Headers $headers
```

#### 输出

```json
{
  "code": 20000,
  "msg": "操作成功",
  "data": {
    "id": 437,
    "name": "Coverage.terrSlope",
    "type": 1,
    "alias": "计算坡度",
    "output": { "name": "output", "type": "Coverage", "format": "TIF" },
    "args": [
      { "name": "coverage", "type": "Coverage", "optional": "False" },
      { "name": "radius", "type": "Integer", "default": "1", "optional": "False" },
      { "name": "zFactor", "type": "Double", "default": "1.0", "optional": "true" }
    ]
  }
}
```

### 示例 B：`Coverage.NDVI`（id=1431，归一化植被指数）

#### 参数（算子 args，给执行接口用）

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| coverage | Coverage | 是 | 多光谱影像 |
| redBandName | String | 是 | 红光波段，Landsat 常用 `B4` |
| nirBandName | String | 是 | 近红外，Landsat 常用 `B5` |
| output | String | 是 | 定义里的输出键，值为结果文件名 |

#### 调用

```powershell
$headers = @{ Authorization = "Bearer <token>" }
Invoke-RestMethod -Method GET `
  -Uri "http://openge.org.cn/api/computation-api/process/info?processName=Coverage.NDVI" `
  -Headers $headers
```

#### 输出

```json
{
  "code": 20000,
  "msg": "操作成功",
  "data": {
    "id": 1431,
    "name": "Coverage.NDVI",
    "type": 1,
    "alias": "归一化植被指数",
    "output": { "name": "output", "type": "Coverage", "format": "TIF" },
    "args": [
      { "name": "coverage", "type": "Coverage", "optional": "False" },
      { "name": "redBandName", "type": "String", "format": "Band", "optional": "False" },
      { "name": "nirBandName", "type": "String", "format": "Band", "optional": "False" }
    ]
  }
}
```

同类：`Coverage.NDWI`（`greenBandName` + `nirBandName`），`Coverage.NDBI`（`swirBandName` + `nirBandName`）。`Coverage.calNDVI` 入参只有 `input`，不是手册 NDVI 请求体那套字段。

### 示例 C：`Coverage.terrAspect`（id=438，地形坡向，**当前唯一已发布算法**）

#### 参数（算子 args，给执行接口用）

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| coverage | Coverage | 是 | DEM |
| radius | Integer | 是 | 默认 `1` |
| output | String | 是 | 定义里的输出键，值为结果文件名 |

#### 调用

```powershell
$headers = @{ Authorization = "Bearer <token>" }
Invoke-RestMethod -Method GET `
  -Uri "http://openge.org.cn/api/computation-api/process/info?processName=Coverage.terrAspect" `
  -Headers $headers
```

#### 输出

```json
{
  "code": 20000,
  "msg": "操作成功",
  "data": {
    "id": 438,
    "name": "Coverage.terrAspect",
    "type": 1,
    "alias": "计算坡向",
    "output": { "name": "output", "type": "Coverage", "format": "TIF" },
    "args": [
      { "name": "coverage", "type": "Coverage", "optional": "False" },
      { "name": "radius", "type": "Integer", "default": "1", "optional": "False" }
    ]
  }
}
```

---

## 7. 执行算子

**API：** `POST /openapi/algorithm/{包}/{算子}/execute`  
**鉴权：** tk  
**Content-Type：** `application/json`

点号换斜杠：`Coverage.terrAspect` → `/openapi/algorithm/Coverage/terrAspect/execute`。

当前已发布算法只有 `Coverage.terrAspect`。这只表示任务已受理，算子是否跑完要查状态。

### 输入（通用参数）

| 参数 | 位置 | 必填 | 说明 |
|------|------|------|------|
| 包 / 算子 | path | 是 | `Coverage.terrAspect` → `Coverage/terrAspect` |
| tk | query 或 header | 是 | `apk.` 开头 |
| 算子 args | body | 是 | 与定义接口 `args` 对应，必须含输出键 `output` |
| coverage | body | 视算子 | 必须是对象 `{"type":"Coverage","id":"..."}`，不能是字符串 |

### 输出（通用）

| HTTP / code | msg | 含义 |
|-------------|-----|------|
| 200 / 20000 | 操作成功 | 已受理，`data.processId` 为 `job-` 前缀 |
| 401 | 缺少应用凭证 tk | 没带 `tk` |
| 401 | 凭证无效 | tk 拼写错误 |
| 401 | 凭证已禁用 | AppKey 被禁用 |
| 403 | 该服务未发布，无法调用 | 算子未对 OpenAPI 开放 |
| 50000 | NullPointerException 等 | 例如把 Coverage 写成字符串、输出键用 `outputName` |

手册还写了成功体带 `taskName`、`status`。实测成功体只有 `processId`。

### 示例 A：`Coverage.terrSlope`（未发布）

#### 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| coverage | object | 是 | DEM，`type` + `id` |
| radius | Integer | 是 | 默认 `1` |
| zFactor | Double | 否 | 默认 `1.0` |
| output | String | 是 | 结果文件名，不能与已有任务重名 |

#### 输入（请求体）

```json
{
  "coverage": {
    "type": "Coverage",
    "id": "Platform:Coverage:ASTGTM_N18E109:ASTER_GDEM_DEM30"
  },
  "radius": 1,
  "zFactor": 1.0,
  "output": "slope_result.tif"
}
```

#### 调用

```powershell
$tk = "apk.xxx"
$body = @{
  coverage = @{
    type = "Coverage"
    id   = "Platform:Coverage:ASTGTM_N18E109:ASTER_GDEM_DEM30"
  }
  radius  = 1
  zFactor = 1.0
  output  = "slope_result.tif"
} | ConvertTo-Json -Compress

Invoke-RestMethod -Method POST `
  -Uri "http://openge.org.cn/api/openapi/algorithm/Coverage/terrSlope/execute?tk=$tk" `
  -ContentType "application/json" `
  -Body $body
```

#### 输出（实测）

HTTP **403**：

```json
{ "code": 403, "msg": "该服务未发布，无法调用", "data": null }
```

### 示例 B：`Coverage.NDVI`（未发布）

#### 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| coverage | object | 是 | 多光谱影像 |
| redBandName | String | 是 | 红光，Landsat 常用 `B4` |
| nirBandName | String | 是 | 近红外，Landsat 常用 `B5` |
| output | String | 是 | 结果文件名 |

#### 输入（请求体）

```json
{
  "coverage": {
    "type": "Coverage",
    "id": "Platform:Coverage:LC09_L2SP_001027_20260109_20260110_02_T1:LC09_C02_L2"
  },
  "redBandName": "B4",
  "nirBandName": "B5",
  "output": "ndvi_result.tif"
}
```

#### 调用

```powershell
$tk = "apk.xxx"
$body = @{
  coverage = @{
    type = "Coverage"
    id   = "Platform:Coverage:LC09_L2SP_001027_20260109_20260110_02_T1:LC09_C02_L2"
  }
  redBandName = "B4"
  nirBandName = "B5"
  output      = "ndvi_result.tif"
} | ConvertTo-Json -Compress

Invoke-RestMethod -Method POST `
  -Uri "http://openge.org.cn/api/openapi/algorithm/Coverage/NDVI/execute?tk=$tk" `
  -ContentType "application/json" `
  -Body $body
```

#### 输出

HTTP **403**：

```json
{ "code": 403, "msg": "该服务未发布，无法调用", "data": null }
```

### 示例 C：`Coverage.terrAspect`（已发布，提交成功）

#### 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| coverage | object | 是 | DEM，`type` + `id` |
| radius | Integer | 是 | 邻域半径，默认 `1` |
| output | String | 是 | 结果文件名，必须换成从未用过的名字 |

#### 输入（请求体）

```json
{
  "coverage": {
    "type": "Coverage",
    "id": "Platform:Coverage:ASTGTM_N18E109:ASTER_GDEM_DEM30"
  },
  "radius": 1,
  "output": "aspect_result.tif"
}
```

#### 调用

```powershell
$tk = "apk.xxx"
$body = @{
  coverage = @{
    type = "Coverage"
    id   = "Platform:Coverage:ASTGTM_N18E109:ASTER_GDEM_DEM30"
  }
  radius = 1
  output = "aspect_result.tif"
} | ConvertTo-Json -Compress

Invoke-RestMethod -Method POST `
  -Uri "http://openge.org.cn/api/openapi/algorithm/Coverage/terrAspect/execute?tk=$tk" `
  -ContentType "application/json" `
  -Body $body
```

#### 输出

`Invoke-RestMethod` 可能把 `msg` 显示成乱码，原文是「操作成功」。

```json
{
  "code": 20000,
  "msg": "操作成功",
  "data": {
    "processId": "job-e4fed5dc-f8cf-42d4-ba42-45ec70d7ed0e"
  }
}
```

| 字段 | 说明 |
|------|------|
| code | `20000` 表示任务已被受理 |
| msg | `操作成功` |
| data.processId | 后续查状态 / 结果用这个 id |

`output` 必须换成从未用过的文件名。手册那种 `"coverage":"Platform:Coverage:..."` + `outputName` 会 NPE。

用平台 DEM 引用执行时，提交可以成功，但任务结束时 `message` 可能报 `缺少产品名称(productName)`，结果接口为 `state=FAILED`。提交成功 ≠ 算子算完。

tk 禁用时（实测）：

```json
{ "code": 401, "msg": "凭证已禁用" }
```

---

## 8. 执行状态

**API：** `GET /computation-api/process/{processId}`  
**鉴权：** 第 1 步登录返回的 JWT（`Authorization: Bearer <token>`）。  
手册写第三方可只带 `tk` 查询，线上不成立：同一 `processId` 只加 `?tk=` 会 `40003`。查询时用登录 token，不要用 AppKey。

### 输入（参数）

| 参数 | 位置 | 必填 | 说明 |
|------|------|------|------|
| processId | path | 是 | 执行接口返回的 `job-xxx` |

### 调用

```powershell
$headers = @{ Authorization = "Bearer <token>" }
Invoke-RestMethod -Method GET `
  -Uri "http://openge.org.cn/api/computation-api/process/job-e4fed5dc-f8cf-42d4-ba42-45ec70d7ed0e" `
  -Headers $headers
```

### 输出

任务不存在：

```json
{
  "code": 50000,
  "msg": "查询状态成功，暂无计算结果！",
  "data": false
}
```

只带 `tk`、不带 JWT：

```json
{ "code": 40003, "msg": "无效token", "data": null }
```

任务已提交、尚未结束：

```json
{
  "code": 20000,
  "msg": "查询状态成功",
  "data": {
    "id": 11645,
    "recordId": "job-baa07fbe-3b71-424f-89a2-be785b415aa1",
    "algorithmName": "Coverage.terrAspect",
    "algorithmResultName": "kunyu_aspect_ok_1791174374.tif",
    "filePath": "oge-user/<uuid>/result/",
    "resultStatus": 0,
    "message": "任务已提交，正在执行",
    "bandStats": null
  }
}
```

任务结束但算子失败时，`code` 仍是 20000，`resultStatus` 仍是 **2**，失败原因在 `message`（不要把 2 当成业务成功）：

```json
{
  "code": 20000,
  "msg": "查询状态成功",
  "data": {
    "resultStatus": 2,
    "message": "[OPERATOR_INTERNAL_ERROR](03002): ... 缺少产品名称(productName)"
  }
}
```

| 字段 | 说明 |
|------|------|
| recordId | 对应 processId |
| algorithmName | 算子名 |
| algorithmResultName | 输出文件名 |
| resultStatus | `0` 已提交 / `2` 已结束（成功或失败都可能是 2，看 `message`） |
| message | 进度或错误 |
| bandStats | tif 元数据，未成功时为 `null` |

手册还写了成功结束时 `bandStats` 含 `width/height/minValue/maxValue`。本次用平台 DEM 引用未跑到业务成功，故未复测该成功体。

---

## 9. 执行结果信息

**API：** `GET /computation-api/process/result/{processId}`  
**鉴权：** JWT

### 输入（参数）

| 参数 | 位置 | 必填 | 说明 |
|------|------|------|------|
| processId | path | 是 | `job-xxx` |

### 调用

```powershell
$headers = @{ Authorization = "Bearer <token>" }
Invoke-RestMethod -Method GET `
  -Uri "http://openge.org.cn/api/computation-api/process/result/job-e4fed5dc-f8cf-42d4-ba42-45ec70d7ed0e" `
  -Headers $headers
```

### 输出

不存在的 job：

```json
{
  "code": 50000,
  "msg": "服务器内部错误: job not found: job-00000000-0000-0000-0000-000000000000",
  "data": null
}
```

运行中：

```json
{
  "code": 50000,
  "msg": "服务器内部错误: result not ready, jobId=job-xxx, state=RUNNING"
}
```

算子失败：

```json
{
  "code": 50000,
  "msg": "服务器内部错误: result not ready, jobId=job-xxx, state=FAILED"
}
```

无 JWT：

```json
{ "code": 40003, "msg": "无效token", "data": null }
```

产物就绪时：

```json
{
  "code": 20000,
  "msg": "成功",
  "data": {
    "jobId": "...",
    "processId": "job-xxx",
    "status": "SUCCESS",
    "outputs": { "resultPath": "..." }
  }
}
```

---

## 10. 结果下载

**API：** `GET /computation-api/process/result/download/{processId}`  
**鉴权：** JWT  

网关不认 query 传 token，不要用 `<a href>` 直链。

### 输入（参数）

| 参数 | 位置 | 必填 | 说明 |
|------|------|------|------|
| processId | path | 是 | `job-xxx` |

### 调用

```powershell
$headers = @{ Authorization = "Bearer <token>" }
Invoke-WebRequest -Method GET `
  -Uri "http://openge.org.cn/api/computation-api/process/result/download/job-e4fed5dc-f8cf-42d4-ba42-45ec70d7ed0e" `
  -Headers $headers `
  -OutFile "C:\data\aspect_result.tif"
```

### 输出

成功且产物就绪：文件流（二进制 tif 等），不是 JSON。本次未跑到产物就绪，未复测成功流。

任务失败或未就绪（实测）：HTTP **404**，Spring 错误 JSON，`status=404`，`error=Not Found`，`path` 为该 download 路径。

无 JWT：

```json
{ "code": 40003, "msg": "无效token", "data": null }
```

---

## 11. COG 预览

**API：** `GET /computation-api/styles/cog/{processId}`  
**鉴权：** JWT  

### 输入（参数）

| 参数 | 位置 | 必填 | 说明 |
|------|------|------|------|
| processId | path | 是 | `job-xxx` |

### 调用

```powershell
$headers = @{ Authorization = "Bearer <token>" }
Invoke-WebRequest -Method GET `
  -Uri "http://openge.org.cn/api/computation-api/styles/cog/job-e4fed5dc-f8cf-42d4-ba42-45ec70d7ed0e" `
  -Headers $headers `
  -OutFile "C:\data\aspect_preview.png"
```

### 输出

成功：图片流（用于在线预览 tif）。本次未跑到产物就绪，未复测成功流。

任务失败、未就绪、或无 JWT：实测常为 HTTP **404** 空 body。

---

## 12. 注册 AppKey

**API：** `POST /management/open/app/key/create`  
**鉴权：** JWT  
**Content-Type：** `application/json`

手册路径 `/open/app/key/create` 实测 **404**。`appKey` 只在创建响应里出现一次明文。详情接口只有脱敏 `appKeyFull`。

### 输入（参数）

| 参数 | 位置 | 必填 | 说明 |
|------|------|------|------|
| appName | body | 是 | 最长 200，汉字/字母/数字/`-`/`_` |
| industryIds | body | 是（缺了会 NPE） | 最多 3 个，id 从 257 起 |
| whitelist | body | 否 | Origin，半角 `;` 分隔；空=不限制 |

### 调用

```powershell
$headers = @{ Authorization = "Bearer <token>" }
$body = @{
  appName     = "my-openapi-app"
  industryIds = @(257)
  whitelist   = ""
} | ConvertTo-Json -Compress

Invoke-RestMethod -Method POST `
  -Uri "http://openge.org.cn/api/management/open/app/key/create" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body $body
```

手册旧路径：

`POST /open/app/key/create`

### 输出（创建成功）

```json
{
  "code": 20000,
  "msg": "操作成功",
  "data": {
    "id": 30,
    "appName": "kunyutest10051222",
    "appKey": "apk.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "appKeySuffix": "C0682B",
    "expireTime": "2027-10-05 12:22:58"
  }
}
```

| 字段 | 说明 |
|------|------|
| id | 应用 id |
| appName | 名称 |
| appKey | 完整 `apk.` + 32 位十六进制，只出现一次 |
| appKeySuffix | 后 6 位，列表里脱敏识别 |
| expireTime | 一年后 |

当前账号应用：`kunyu`（id=28）与上述测试应用（id=30）。完整 Key 只在创建时返回，请自行保存。

列表：`POST /management/open/app/key/list`，body `{"pageNumber":1,"pageSize":20}`。  
详情：`GET /management/open/app/key/detail/{id}`（无明文 key）。

---

## 13. 行业类别列表

**API：** `GET /management/open/app/key/industries`  
**鉴权：** JWT  

手册路径 `/open/app/key/industries` 实测 **404**。

### 输入（参数）

| 参数 | 位置 | 必填 | 说明 |
|------|------|------|------|
| Authorization | header | 是 | `Bearer <token>` |
| 无 query / body | — | — | 无其它业务参数 |

### 调用

```powershell
$headers = @{ Authorization = "Bearer <token>" }
Invoke-RestMethod -Method GET `
  -Uri "http://openge.org.cn/api/management/open/app/key/industries" `
  -Headers $headers
```

### 输出（实测 33 条，节选）

```json
{
  "code": 20000,
  "msg": "操作成功",
  "data": [
    { "id": 257, "code": null, "name": "公共管理", "sort": 1 },
    { "id": 258, "code": null, "name": "公共安全", "sort": 2 },
    { "id": 259, "code": null, "name": "民政", "sort": 3 }
  ]
}
```

| 字段 | 说明 |
|------|------|
| id | 创建 AppKey 时写入 `industryIds` |
| name | 行业名 |
| sort | 排序 |

---

## 14. 执行组合模型

**API：** `POST /openapi/combination/{serviceName}/execute`  
**鉴权：** tk  
**Content-Type：** `application/json`

路径中的中文服务名需要 URL 编码。组合模型参数以该服务为准，不要照搬 DEM 的 `coverage/output`。状态/结果查询复用第 8～11 节（JWT）。

### 输入（通用参数）

| 参数 | 位置 | 必填 | 说明 |
|------|------|------|------|
| serviceName | path | 是 | 已发布组合模型名称 |
| tk | query 或 header | 是 | `apk.` 开头 |
| 模型参数 | body | 是 | 以该服务定义为准 |

### 示例 A：`坡度分析模型`（未发布）

#### 参数

手册示例把 DEM 的 `coverage` / `outputName` 套过来。线上该名称未发布，body 尚未被业务校验。

#### 输入

```json
{
  "coverage": {
    "type": "Coverage",
    "id": "Platform:Coverage:ASTGTM_N18E109:ASTER_GDEM_DEM30"
  },
  "output": "slope_model_result.tif"
}
```

#### 调用

```powershell
$tk = "apk.xxx"
$name = [uri]::EscapeDataString("坡度分析模型")
$body = @{
  coverage = @{
    type = "Coverage"
    id   = "Platform:Coverage:ASTGTM_N18E109:ASTER_GDEM_DEM30"
  }
  output = "slope_model_result.tif"
} | ConvertTo-Json -Compress

Invoke-RestMethod -Method POST `
  -Uri "http://openge.org.cn/api/openapi/combination/$name/execute?tk=$tk" `
  -ContentType "application/json" `
  -Body $body
```

#### 输出（实测）

HTTP **403**：

```json
{ "code": 403, "msg": "该服务未发布，无法调用", "data": null }
```

### 示例 B：`FC_Filter_EQ`（列表显示已发布，执行仍 403）

#### 参数

未拿到该模型正式 args。套用 DEM body 只用来确认发布开关。

#### 调用

```powershell
$tk = "apk.xxx"
$body = @{
  coverage = @{
    type = "Coverage"
    id   = "Platform:Coverage:ASTGTM_N18E109:ASTER_GDEM_DEM30"
  }
  output = "fc_filter_eq_probe.tif"
} | ConvertTo-Json -Compress

Invoke-RestMethod -Method POST `
  -Uri "http://openge.org.cn/api/openapi/combination/FC_Filter_EQ/execute?tk=$tk" `
  -ContentType "application/json" `
  -Body $body
```

#### 输出

HTTP **403**：

```json
{ "code": 403, "msg": "该服务未发布，无法调用", "data": null }
```

### 示例 C：`ship_detect_GP1`（能提交）

#### 参数

未拿到该模型正式 args。实测套用 DEM 的 `coverage/output` 可以提交，但后续状态失败（缺覆盖数据）。正确参数以该服务为准。

#### 调用

```powershell
$tk = "apk.xxx"
$body = @{
  coverage = @{
    type = "Coverage"
    id   = "Platform:Coverage:ASTGTM_N18E109:ASTER_GDEM_DEM30"
  }
  output = "ship_detect_probe.tif"
} | ConvertTo-Json -Compress

Invoke-RestMethod -Method POST `
  -Uri "http://openge.org.cn/api/openapi/combination/ship_detect_GP1/execute?tk=$tk" `
  -ContentType "application/json" `
  -Body $body
```

#### 输出（实测）

HTTP 200，body 为裸对象（无 `code/msg/data` 包装）：

```json
{ "processId": "job-a0477ad0-7ef5-46df-b88b-c67957120eaf" }
```

手册写的组合模型成功体是 `{"code":20000,"msg":"成功","data":{"processId":"...","taskName":"...","status":"running"}}`，与这条实测不一致。

---

## 常见错误

| 现象 | 实测 / 处理 |
|------|-------------|
| `40000` 参数为空 | 登录缺 username/password |
| `40003` 无效 token | 缺 JWT 或 JWT 失效 |
| HTTP 401 缺少应用凭证 tk | `/openapi/**` 没带 `tk` |
| HTTP 401 凭证无效 | tk 拼写错误 |
| HTTP 401 凭证已禁用 | AppKey 被禁用 |
| HTTP 403 该服务未发布，无法调用 | 算子或组合模型未对 OpenAPI 开放 |
| 状态 `resultStatus=2` 但无结果 | 看 `message`；可能是算子内部失败 |
| 结果 `state=FAILED` / 下载 404 | 任务未产出文件 |
| HTTP 404（AppKey 相关） | 用了手册的 `/open/app/key/**`，应加 `/management` |
| `50000` 暂无计算结果 | 状态查询：job 不存在 |
| `50000` job not found | 结果查询：job 不存在 |
| 任务名称已存在 | 更换 `output` 文件名 |
| 登录连续失败 5 次 | 账号锁定 |
| PowerShell `msg` 乱码 | UTF-8 被当成 Latin-1；见文首说明 |
