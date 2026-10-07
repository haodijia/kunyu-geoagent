# OGE 开发 API

## 1. 登录

### 怎么请求

- 方法：`POST`
- 地址：`http://openge.org.cn/api/oauth/token`
- Content-Type：`multipart/form-data`（客户端自动生成 boundary）
- 鉴权：无需 Token

### 输入是什么

| 参数 | 位置 | 类型 | 值 / 说明 |
| --- | --- | --- | --- |
| scopes | Query | string | `web` |
| client_id | Query | string | `test` |
| client_secret | Query | string | `123456` |
| grant_type | Query | string | `password` |
| username | 表单 | string | 平台账号，必填 |
| password | 表单 | string | 明文密码，必填，不做 MD5 转换 |

### 输出是什么

返回 JSON，登录成功时 HTTP `200`、`code=20000`。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| code | integer | 业务码：`20000` 登录成功；`40000` 参数为空 |
| msg | string | 提示信息，成功时为空字符串 |
| data | object / null | 成功时为令牌信息，参数为空时为 `null` |
| data.token | string | 用户访问令牌 |
| data.refreshToken | string | 刷新令牌 |
| data.tokenHead | string | `Bearer `，末尾有一个空格 |
| data.expiresIn | integer | 访问令牌有效秒数：`43200`（12 小时） |
| data.exp | integer | 访问令牌过期时间，Unix 秒 |
| data.refreshExpiresIn | integer | 刷新令牌有效秒数：`2592000`（30 天） |
| data.refreshExp | integer | 刷新令牌过期时间，Unix 秒 |

### 一个例子

请求：

```bash
curl --request POST \
  'http://openge.org.cn/api/oauth/token?scopes=web&client_id=test&client_secret=123456&grant_type=password' \
  --form-string 'username=haodijia703' \
  --form-string 'password=jia20040703'
```

响应（2026-10-07 实测）：

```json
{
  "code": 20000,
  "msg": "",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOjQ2ODIsInJvbGVJZHMiOiI0MywyIiwidXNlcl9uYW1lIjoiaGFvZGlqaWE3MDMiLCJzY29wZSI6WyJ3ZWIiXSwiZXhwIjoxNzkxNDA3NTQwLCJ1dWlkIjoiOWIwMmJhYTAtMDIwMS00OWJjLTk0M2UtMmY4ZGI1NjU2MDk5Iiwicm9sZU5hbWVzIjoi5rW36Ziz56ue6LWb5Lq65ZGYLOaZrumAmueUqOaItyIsInJvbGVUeXBlcyI6IkNVU1RPTSxOT1JNQUwiLCJhdXRob3JpdGllcyI6WyJDVVNUT00iLCJOT1JNQUwiXSwianRpIjoiMGVXWHhXSnBmNzNZdmdVSmtPNWctYUxwV0NBIiwiY2xpZW50X2lkIjoidGVzdCIsInVzZXJuYW1lIjoiaGFvZGlqaWE3MDMifQ.XYq46a2kkIx49D77dHu5bz1JZiXmipm6p0z6sQea5mU",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX25hbWUiOiJoYW9kaWppYTcwMyIsInV1aWQiOiI5YjAyYmFhMC0wMjAxLTQ5YmMtOTQzZS0yZjhkYjU2NTYwOTkiLCJyb2xlVHlwZXMiOiJDVVNUT00sTk9STUFMIiwiYXV0aG9yaXRpZXMiOlsiQ1VTVE9NIiwiTk9STUFMIl0sImNsaWVudF9pZCI6InRlc3QiLCJ1aWQiOjQ2ODIsInJvbGVJZHMiOiI0MywyIiwic2NvcGUiOlsid2ViIl0sImF0aSI6IjBlV1h4V0pwZjczWXZnVUprTzVnLWFMcFdDQSIsImV4cCI6MTc5Mzk1NjM0MCwicm9sZU5hbWVzIjoi5rW36Ziz56ue6LWb5Lq65ZGYLOaZrumAmueUqOaItyIsImp0aSI6ImZNS0xXZ21sRU45SlBENFZ5dUtUTmpDNzJSNCIsInVzZXJuYW1lIjoiaGFvZGlqaWE3MDMifQ.-ArjTAn8Zj8dKJkPWJeAeqD5-Oynawzc5p1JCIfXbo4",
    "tokenHead": "Bearer ",
    "expiresIn": 43200,
    "exp": 1791407540,
    "refreshExpiresIn": 2592000,
    "refreshExp": 1793956340
  }
}
```

## 2. 按时间和地点检索卫星影像

### 怎么请求

- 方法：`POST`
- 地址：`http://openge.org.cn/api/data-product/retrieval`
- Content-Type：`multipart/form-data`（客户端自动生成 boundary）
- 鉴权：实测无需 Token

可跨产品查询具体影像。地点使用平台行政区代码、多边形或经纬度范围，不能直接传“武汉市”等地名。

### 输入是什么

所有参数放在表单中，按文本提交。

| 参数 | 类型 | 必填 | 值 / 说明 |
| --- | --- | --- | --- |
| startTime | string | 是 | 开始时间，格式 `yyyy-MM-dd HH:mm:ss` |
| endTime | string | 是 | 结束时间，格式 `yyyy-MM-dd HH:mm:ss` |
| type | integer | 是 | 区域方式：`0` 行政区、`1` 多边形、`3` 经纬度矩形；不是卫星类型 |
| code | string | type=0 时 | 平台行政区代码，武汉市为 `420100` |
| level | integer | type=0 时 | 平台行政区层级，武汉市为 `3` |
| points | string | type=1 时 | JSON 坐标数组，点按 `[经度,纬度]` 排列，首尾闭合 |
| minx | number | type=3 时 | 最小经度（西边界） |
| miny | number | type=3 时 | 最小纬度（南边界） |
| maxx | number | type=3 时 | 最大经度（东边界） |
| maxy | number | type=3 时 | 最大纬度（北边界） |
| productIds | string | 否 | 产品数字 ID，多个用逗号分隔；不传则跨产品查询。`454,456` 为 Landsat 9 的 L1、L2 产品 |
| useCloud | boolean | 是 | `true` 启用云量筛选，`false` 不筛选 |
| minCloud | number | useCloud=true 时 | 最小云量百分比，如 `0` |
| maxCloud | number | useCloud=true 时 | 最大云量百分比，如 `20` |
| pageNum | integer | 是 | 页码，从 `1` 开始 |
| pageSize | integer | 是 | 每页条数 |

经纬度使用 WGS84（`EPSG:4326`）。三组区域参数按 `type` 选择一组：

- 行政区：`type=0`、`code=420100`、`level=3`，查询武汉市行政区域。
- 多边形：`type=1`、`points=[[114.2,30.4],[114.5,30.4],[114.5,30.7],[114.2,30.7],[114.2,30.4]]`。
- 矩形：`type=3`、`minx=114.2`、`miny=30.4`、`maxx=114.5`、`maxy=30.7`，查询武汉市区的一块范围。

平台行政区代码和层级可从 `GET http://openge.org.cn/api/data-product/administrative-region/tree` 的 `data` 树中读取 `name`、`code`、`level`；本次已核对武汉市。

### 输出是什么

返回 JSON，成功时 HTTP `200`、`code=20000`。`data.records` 为具体影像列表，继续增加 `pageNum` 可读取后续页。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| code | integer | `20000` 检索成功；云量范围不合规时实测为 `50000` |
| msg | string | 成功时为 `检索成功` |
| data.pages | integer | 总页数 |
| data.currentPage | integer | 当前页码 |
| data.total | integer | 符合条件的影像记录总数，无结果时为 `0` |
| data.pageSize | integer | 每页条数 |
| data.records | array | 当前页影像，无结果时为空数组 |
| records[].imageId | integer | 影像 ID |
| records[].imageIdentification | string | 影像标识 |
| records[].productId | integer | 产品数字 ID |
| records[].productName | string | 产品名，如 `LJ3II_L1B_Fusion`、`LC09_C02_L2`、`S2_MSIL2A` |
| records[].mission / missionEn | string | 卫星 / 任务名称 |
| records[].phenomenonTime | string | 影像采集日期 |
| records[].coverCloud | number | 云量百分比 |
| records[].resolution / resolutionEn | string | 产品分辨率描述 |
| records[].productLevel / productLevelEn | string | 产品处理级别 |
| records[].sensor / sensorEn | string | 传感器类别 |
| records[].crs | string | 影像坐标系 |
| records[].upperLeftLong / upperLeftLat | number | 左上角经纬度 |
| records[].upperRightLong / upperRightLat | number | 右上角经纬度 |
| records[].lowerLeftLong / lowerLeftLat | number | 左下角经纬度 |
| records[].lowerRightLong / lowerRightLat | number | 右下角经纬度 |
| records[].width / height | integer | 影像宽、高，单位为像素 |
| records[].path | string | 平台内部数据路径，不是下载 URL |

返回的是与区域相交的影像。同一次采集的不同产品级别会分别返回，因此 `total` 是记录数。

### 一个例子

查询 **2025 年 1 月，武汉市行政区域内的卫星影像**，不限制产品、不筛云量，每页取 1 条。

请求：

```bash
curl --request POST 'http://openge.org.cn/api/data-product/retrieval' \
  --form-string 'startTime=2025-01-01 00:00:00' \
  --form-string 'endTime=2025-01-31 23:59:59' \
  --form-string 'type=0' \
  --form-string 'code=420100' \
  --form-string 'level=3' \
  --form-string 'useCloud=false' \
  --form-string 'pageNum=1' \
  --form-string 'pageSize=1'
```

响应（2026-10-07 实测，共 458 条，以下为第 1 页完整响应）：

```json
{
  "code": 20000,
  "msg": "检索成功",
  "data": {
    "pages": 458,
    "currentPage": 1,
    "total": 458,
    "pageSize": 1,
    "records": [
      {
        "imageId": 3537347,
        "productId": 593,
        "imageIdentification": "LJ3II_FUS_E114.86_N30.65_20250101_L1B_063",
        "path": "LJ3II_L1/LJ3II_L1B_Fusion/LJ3II_FUS_E114.86_N30.65_20250101_L1B_063",
        "crs": "EPSG:4326",
        "coverCloud": 0.0,
        "mapProjection": null,
        "utmZone": null,
        "phenomenonTime": "2025-01-01",
        "resultTime": null,
        "upperLeftLat": 30.7105508132,
        "upperLeftLong": 114.7809550506,
        "upperRightLat": 30.7105508132,
        "upperRightLong": 114.9317787686,
        "lowerLeftLat": 30.5672926603,
        "lowerLeftLong": 114.7809550506,
        "lowerRightLat": 30.5672926603,
        "lowerRightLong": 114.9317787686,
        "createBy": "admin",
        "createTime": "2026-08-04",
        "updateBy": "admin",
        "updateTime": "2026-08-06",
        "rowResolution": 5.358e-06,
        "colResolution": 5.358e-06,
        "height": 26737,
        "width": 28149,
        "unit": "degree",
        "thumb": null,
        "preview": null,
        "productName": "LJ3II_L1B_Fusion",
        "catalogId": 31,
        "catalogName": "珞珈系列产品",
        "catalogNameEn": "Luojia series products",
        "keyTag": "土地利用",
        "keyTagEn": "Land Use",
        "sensor": "光学",
        "sensorEn": "Optical",
        "resolution": "0.5米",
        "resolutionEn": "0.5m",
        "productLevel": "L1B",
        "productLevelEn": "L1B",
        "productCrs": null,
        "productCrsEn": null,
        "coverArea": null,
        "coverAreaEn": null,
        "updateFrequency": null,
        "updateFrequencyEn": null,
        "mission": "武汉一号",
        "missionEn": "LJ3II",
        "isCollected": null,
        "collectTime": null,
        "bands": null,
        "geomWkt": null
      }
    ]
  }
}
```

## 3. 影像详情

### 怎么请求

- 方法：`GET`
- 地址：`http://openge.org.cn/api/data-product/image/detail`
- 鉴权：实测无需 Token

### 输入是什么

| 参数 | 位置 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| imageId | Query | integer | 是 | 影像检索接口返回的 `data.records[].imageId`，如 `3537347` |

### 输出是什么

返回 JSON，成功时 HTTP `200`、`code=20000`。`data` 为单条影像详情。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| code | integer | `20000` 请求成功；缺少 imageId 时实测为 `50000` |
| msg | string | 成功时为空字符串 |
| data | object / null | 影像详情；影像不存在时实测仍为 `code=20000`，但 `data=null` |
| data.imageId | integer | 影像 ID |
| data.productId | integer | 产品数字 ID |
| data.imageIdentification | string | 影像标识 |
| data.productName | string | 产品名 |
| data.mission / missionEn | string | 卫星 / 任务名称 |
| data.phenomenonTime | string | 影像采集日期 |
| data.coverCloud | number | 云量百分比 |
| data.resolution / resolutionEn | string | 产品分辨率描述，如 `0.5米` |
| data.productLevel / productLevelEn | string | 产品处理级别 |
| data.sensor / sensorEn | string | 传感器类别 |
| data.crs | string | 影像坐标系 |
| data.upperLeftLong / upperLeftLat | number | 左上角经纬度 |
| data.upperRightLong / upperRightLat | number | 右上角经纬度 |
| data.lowerLeftLong / lowerLeftLat | number | 左下角经纬度 |
| data.lowerRightLong / lowerRightLat | number | 右下角经纬度 |
| data.width / height | integer | 影像宽、高，单位为像素 |
| data.rowResolution / colResolution | number | 栅格分辨率，单位见 `data.unit` |
| data.unit | string | 栅格分辨率单位，示例为 `degree` |
| data.path | string | 平台内部数据路径 |
| data.thumb / preview | string / null | 缩略图、预览字段，本例均为 `null`；图片通过第 4 个接口获取 |
| data.bands | null（本例） | 波段信息，本例为空，非空结构待验证 |
| data.geomWkt | string / null | WKT 几何字段，本例为 `null` |

可空字段以实际响应为准，不能仅凭 `code=20000` 判断影像存在，还需检查 `data`。

### 一个例子

获取第 2 个接口示例中返回的武汉一号影像详情。

请求：

```bash
curl --get 'http://openge.org.cn/api/data-product/image/detail' \
  --data-urlencode 'imageId=3537347'
```

响应（2026-10-07 实测，完整响应）：

```json
{
  "code": 20000,
  "msg": "",
  "data": {
    "imageId": 3537347,
    "productId": 593,
    "imageIdentification": "LJ3II_FUS_E114.86_N30.65_20250101_L1B_063",
    "path": "LJ3II_L1/LJ3II_L1B_Fusion/LJ3II_FUS_E114.86_N30.65_20250101_L1B_063",
    "crs": "EPSG:4326",
    "coverCloud": 0.0,
    "mapProjection": null,
    "utmZone": null,
    "phenomenonTime": "2025-01-01",
    "resultTime": null,
    "upperLeftLat": 30.7105508132,
    "upperLeftLong": 114.7809550506,
    "upperRightLat": 30.7105508132,
    "upperRightLong": 114.9317787686,
    "lowerLeftLat": 30.5672926603,
    "lowerLeftLong": 114.7809550506,
    "lowerRightLat": 30.5672926603,
    "lowerRightLong": 114.9317787686,
    "createBy": "admin",
    "createTime": "2026-08-04",
    "updateBy": "admin",
    "updateTime": "2026-08-06",
    "rowResolution": 5.358e-06,
    "colResolution": 5.358e-06,
    "height": 26737,
    "width": 28149,
    "unit": "degree",
    "thumb": null,
    "preview": null,
    "productName": "LJ3II_L1B_Fusion",
    "catalogId": null,
    "catalogName": "珞珈系列产品",
    "catalogNameEn": "Luojia series products",
    "keyTag": "土地利用",
    "keyTagEn": "Land Use",
    "sensor": "光学",
    "sensorEn": "Optical",
    "resolution": "0.5米",
    "resolutionEn": "0.5m",
    "productLevel": "L1B",
    "productLevelEn": "L1B",
    "productCrs": null,
    "productCrsEn": null,
    "coverArea": null,
    "coverAreaEn": null,
    "updateFrequency": null,
    "updateFrequencyEn": null,
    "mission": "武汉一号",
    "missionEn": "LJ3II",
    "isCollected": null,
    "collectTime": null,
    "bands": null,
    "geomWkt": null
  }
}
```

## 4. 影像预览

### 怎么请求

- 方法：`GET`
- 地址：`http://openge.org.cn/api/data-product/image/getImagePreview`
- 鉴权：实测无需 Token

### 输入是什么

| 参数 | 位置 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| imageId | Query | integer | 是 | 影像检索或详情接口返回的影像 ID，如 `3537347` |

### 输出是什么

成功时直接返回 PNG 图片二进制，可用于缩略图或预览展示。

| 项目 | 实测值 / 说明 |
| --- | --- |
| HTTP 状态 | `200` |
| Content-Type | `image/png` |
| Content-Disposition | `inline; filename=3537347.png` |
| 响应体 | PNG 图片二进制，按图片读取或保存，无 `code/msg/data` 包装 |
| 示例图片尺寸 | `262 × 249` 像素 |
| 示例图片大小 | `150491` 字节 |

失败时返回 `application/json`，HTTP 状态仍为 `200`：

| 场景 | code | msg | data |
| --- | --- | --- | --- |
| imageId=-1，影像不存在 | `50000` | `缩略图不存在：-1` | `null` |
| 未传 imageId | `50000` | `服务器内部错误: Required Integer parameter 'imageId' is not present` | `null` |

开发时根据响应 `Content-Type` 读取图片或 JSON 错误；图片大小和尺寸随影像变化。

### 一个例子

获取同一景武汉一号影像的预览图，保存为 `image-preview.png`。

请求：

```bash
curl --get 'http://openge.org.cn/api/data-product/image/getImagePreview' \
  --data-urlencode 'imageId=3537347' \
  --output image-preview.png
```

响应（2026-10-07 实测）：

```http
HTTP/1.1 200 OK
Content-Type: image/png
Content-Length: 150491
Content-Disposition: inline; filename=3537347.png
```

响应体为 PNG 图片二进制；实测可正常解码为 `262 × 249` 像素的 RGBA 图片。
