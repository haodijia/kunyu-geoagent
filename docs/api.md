# 开放地球引擎 OpenAPI 接口汇总

整理对象：[开放地球引擎](http://www.openearth.org.cn/dataset)（OGE / Open Geospatial Engine）  
整理日期：2026-10-04  
网关 Base URL：`http://www.openearth.org.cn/api`

下文命令已在 **Windows PowerShell** 用 `curl.exe` 实测，业务码为 `20000`（图片接口为 HTTP 200）。  
占位符请替换粘贴：`<账号>`、`<密码>`、`<JWT>`、`apk.xxx`。

- `<JWT>` 来自登录返回的 `data.token`。

统一响应：

```json
{ "code": 20000, "msg": "获取成功", "data": {} }
```

成功时业务数据在 `data`。分页常见字段：`pages`、`currentPage`、`total`、`pageSize`、`records`。

| 场景 | 凭证 | 携带方式 |
|------|------|----------|
| 登录后的站点接口（AppKey、已发布服务、任务状态等） | 用户 JWT | `-H "Authorization: Bearer <JWT>"` |
| 调用已发布算法 OpenAPI | 应用凭证 `tk`（`apk.` 前缀，总长 36） | Query `?tk=apk.xxx` |

---

## 1. 登录与当前用户

### 1.1 登录换 JWT

```powershell
curl.exe -s -X POST "http://www.openearth.org.cn/api/oauth/token?scopes=web&client_secret=123456&client_id=test&grant_type=password" -F "username=<账号>" -F "password=<明文密码>"
```

`data` 含 `token`、`refreshToken`、`tokenHead`（`Bearer `）、`expiresIn`、`exp`。站点 OAuth client 为 `test` / `123456`。把 `data.token` 整段复制，后面替换 `<JWT>`。

### 1.2 当前用户

```powershell
curl.exe -s "http://www.openearth.org.cn/api/user/get/user" -H "Authorization: Bearer <JWT>"
```

---

## 2. AppKey（tk）

网页：[应用管理](http://www.openearth.org.cn/open-platform/app-manage)  
`appName` 最长 200，仅汉字/字母/数字/`-`/`_`。`whitelist` 为 Origin 白名单，半角 `;` 分隔，空表示不限制。创建响应里的 `data.appKey` **只出现这一次明文**，有效期 1 年。

### 2.1 行业列表

创建应用时 `industryIds` 必填。行业 id 从 257 起，例如公共管理 `257`、公共安全 `258`、测绘 `266`。

```powershell
curl.exe -s "http://www.openearth.org.cn/api/management/open/app/key/industries" -H "Authorization: Bearer <JWT>"
```

### 2.2 创建应用

```powershell
curl.exe --% -s -X POST http://www.openearth.org.cn/api/management/open/app/key/create -H "Authorization: Bearer <JWT>" -H "Content-Type: application/json" -d "{\"appName\":\"kunyu\",\"industryIds\":[257],\"whitelist\":\"\"}"
```

把 `<JWT>` 换成真实 token 后再执行。`data` 含 `id`、`appName`、`appKey`、`expireTime`。

### 2.3 应用列表

```powershell
curl.exe --% -s -X POST http://www.openearth.org.cn/api/management/open/app/key/list -H "Authorization: Bearer <JWT>" -H "Content-Type: application/json" -d "{\"pageNumber\":1,\"pageSize\":20}"
```

记录含 `id`、`appName`、`appKeyMask`、`expireTime`、`status`。当前账号下 `kunyu` 的 id 为 `28`。

### 2.4 应用详情

```powershell
curl.exe -s "http://www.openearth.org.cn/api/management/open/app/key/detail/28" -H "Authorization: Bearer <JWT>"
```

### 2.5 删除应用

会删掉对应应用，确认 id 后再执行。

```powershell
curl.exe -s -X POST "http://www.openearth.org.cn/api/management/open/app/key/28" -H "Authorization: Bearer <JWT>"
```

将 `28` 换成要删除的 `id`。无 body。

---

## 3. 已发布服务与算法执行

网页：[平台服务](http://www.openearth.org.cn/open-platform/platform-service)

当前 `page-published` 返回：

| serviceType | 条数 | 名称 |
|-------------|------|------|
| `ALGORITHM` | 1 | `Coverage.terrAspect` |
| `COMPOSITE_MODEL` | 2 | `FC_Filter_EQ`、`ship_detect_GP1` |
| `DATA` | 0 | — |

可执行的算法 OpenAPI 为 `Coverage.terrAspect`（地形坡向计算）。

### 3.1 列出已发布服务

```powershell
curl.exe --% -s -X POST http://www.openearth.org.cn/api/management/platform-service/page-published -H "Authorization: Bearer <JWT>" -H "Content-Type: application/json" -d "{\"pageNumber\":1,\"pageSize\":20,\"serviceType\":\"ALGORITHM\"}"
```

`serviceType` 取值：`ALGORITHM`、`COMPOSITE_MODEL`、`DATA`。

### 3.2 算子参数定义

```powershell
curl.exe -s "http://www.openearth.org.cn/api/computation-api/process/info?processName=Coverage.terrAspect" -H "Authorization: Bearer <JWT>"
```

无需登录也可查算法中心详情（`modelId=438` 即 `Coverage.terrAspect`）：

```powershell
curl.exe -s "http://www.openearth.org.cn/api/model/get?modelId=438"
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| coverage | Coverage | 是 | DEM。写成对象，`id` 为 `Platform:Coverage:{imageIdentification}:{productName}` |
| radius | Integer | 是 | 邻域半径，默认 `1`（3×3 窗口） |
| output | 输出文件名 | 是 | 定义里输出字段名为 `output`，同一用户不可与已有任务重名 |

输入数据引用：

| 来源 | 格式 |
|------|------|
| 平台单景 | `Platform:Coverage:{imageIdentification}:{productName}` |
| 平台多景 | `Platform:Product:Coverage:{productName}:{imageId1,imageId2}` |
| 平台产品 | `Platform:Product:{productName}` |
| 我的数据 | `Personal:MyData:myData/{文件名}` |
| 个人资产 | `Personal:Asset:{assetUuid}` |
| 处理结果 | `Personal:Process:{processId}` |

### 3.3 执行 terrAspect

路径规则：算子名里的 `.` 换成 `/`。Body 为算子 args 本身。把 `apk.xxx` 换成真实 AppKey，并把 `output` 改成从未用过的文件名。

```powershell
curl.exe --% -s -X POST http://www.openearth.org.cn/api/openapi/algorithm/Coverage/terrAspect/execute?tk=apk.xxx -H "Content-Type: application/json" -d "{\"coverage\":{\"type\":\"Coverage\",\"id\":\"Platform:Coverage:ASTGTM_N00E006:ASTER_GDEM_DEM30\"},\"radius\":1,\"output\":\"aspect_result.tif\"}"
```

成功响应：

```json
{ "code": 20000, "msg": "操作成功", "data": { "processId": "job-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" } }
```

### 3.4 查询任务状态

把 `<processId>` 换成上一步的 `data.processId`。`resultStatus`：`0` 已提交等待执行，`2` 已结束。

```powershell
curl.exe -s "http://www.openearth.org.cn/api/computation-api/process/<processId>" -H "Authorization: Bearer <JWT>"
```

`data` 含 `recordId`、`algorithmName`、`algorithmResultName`、`resultStatus`、`message`、`createTime`、`updateTime`。

### 3.5 推荐调用顺序

1. 第 1.1 节登录拿 JWT  
2. 第 2 节创建/查看 AppKey 拿 `tk`  
3. 第 3.1 节确认已发布服务  
4. 第 4 节取 `productName` + `imageIdentification`，拼 Coverage `id`  
5. 第 3.3 节 execute  
6. 第 3.4 节用 JWT 查状态  

---

## 4. 数据中心

多数无需登录。产品 `type`：`0` 影像，`1` 矢量，`4` 样本集。网页：[数据中心](http://www.openearth.org.cn/dataset)

### 4.1 标签与目录

```powershell
curl.exe -s "http://www.openearth.org.cn/api/data-product/getTags"
```

```powershell
curl.exe -s "http://www.openearth.org.cn/api/data-product/getCatalogTree"
```

```powershell
curl.exe -s "http://www.openearth.org.cn/api/data-product/getTree"
```

```powershell
curl.exe -s "http://www.openearth.org.cn/api/data-product/getTopKeyDisplayProducts"
```

`getCatalogTree` / `getTree` 顶级为 7 类。`getTopKeyDisplayProducts` 为 `LJ3II_MSS`、`LJ3II_PAN`、`LJ3II_HSI`。

### 4.2 产品列表

```powershell
curl.exe --% -s -X POST http://www.openearth.org.cn/api/data-product/listByTags4Catalog -H "Content-Type: application/json" -d "{\"tagIds\":[],\"pageNum\":1,\"pageSize\":12,\"sortType\":0,\"keywords\":\"\",\"catalogId\":null}"
```

`records[]` 含 `id`、`name`、`alias`、`aliasEn`、`type`、`catalogId`、`description`、`timeFrame`、`imageCount`、`tags`。实测 `total=103`。

```powershell
curl.exe --% -s -X POST http://www.openearth.org.cn/api/data-product/list/name -H "Content-Type: application/json" -d "{\"type\":0}"
```

```powershell
curl.exe --% -s -X POST http://www.openearth.org.cn/api/data-product/list/name-with-alias -H "Content-Type: application/json" -d "{\"type\":0}"
```

后两个返回产品英文名数组，实测 60 条。

### 4.3 产品详情

```powershell
curl.exe -s "http://www.openearth.org.cn/api/data-product/get?productId=124&type=0"
```

`productId=124` 为 `ASTER_GDEM_DEM30`（影像，`imageCount` 约 22466）。封面图（JPEG）：

```powershell
curl.exe -s -o "$env:TEMP\oge-cover-124.jpg" "http://www.openearth.org.cn/api/management/data-product/preview/cover?id=124"
```

### 4.4 影像条目

```powershell
curl.exe -s "http://www.openearth.org.cn/api/data-product/image/pageByProductId?productId=124&pageNum=1&pageSize=10"
```

记录含 `imageId`、`imageIdentification`、`path`、`crs`、`phenomenonTime`、四角经纬度。按标识过滤：

```powershell
curl.exe -s "http://www.openearth.org.cn/api/data-product/image/listByProductId?productId=124&imageIdentification=ASTGTM_N00E006"
```

引用：`Platform:Coverage:ASTGTM_N00E006:ASTER_GDEM_DEM30`

```powershell
curl.exe -s "http://www.openearth.org.cn/api/data-product/image/detail?imageId=15936"
```

预览图（PNG）：

```powershell
curl.exe -s -o "$env:TEMP\oge-preview-15936.png" "http://www.openearth.org.cn/api/data-product/image/getImagePreview?imageId=15936"
```

### 4.5 行政区

```powershell
curl.exe -s "http://www.openearth.org.cn/api/data-product/administrative-region/tree"
```

树节点含 `code`、`level`。按代码取边界时两者都要带，例如福建 `350000`、`level=2`：

```powershell
curl.exe -s "http://www.openearth.org.cn/api/data-product/administrative-region/getArcsByAdministrativeCode?administrativeCode=350000&level=2"
```

---

## 5. 算法中心

无需登录。网页：[算法中心](http://www.openearth.org.cn/models)  
算子名录见 [oge-algorithm-openapi.md](./oge-algorithm-openapi.md)。

```powershell
curl.exe -s "http://www.openearth.org.cn/api/model/getTags"
```

```powershell
curl.exe -s "http://www.openearth.org.cn/api/model/getCatalogTree"
```

```powershell
curl.exe -s "http://www.openearth.org.cn/api/model/getTree"
```

```powershell
curl.exe --% -s -X POST http://www.openearth.org.cn/api/model/listByTags4Catalog -H "Content-Type: application/json" -d "{\"tagIds\":[],\"pageNum\":1,\"pageSize\":12,\"sortType\":0,\"keywords\":\"\"}"
```

实测 `total=508`，本页 12 条。

```powershell
curl.exe -s "http://www.openearth.org.cn/api/model/get?modelId=438"
```

---

## 6. 首页统计

```powershell
curl.exe -s "http://www.openearth.org.cn/api/management/homePage/info"
```

`data` 含 `apiCount`、`modelCount`、`onlineData`、`totalSpace`。此处 `apiCount` 是平台资源统计，不是已发布 OpenAPI 条数。
