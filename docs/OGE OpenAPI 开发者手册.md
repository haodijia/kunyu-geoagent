<!-- 原 PDF 第 1 页 -->
# OGE 计算中心 · OpenAPI 计算案例（开发者手册）
 文档定位：面向开发者的技术手册。涵盖系统架构、接口协议、前端代码结构、二次开发指南、部署与
 调试。读者对象为接入/维护本案例的开发者。
本案例是一个零外部依赖的纯前端单页应用，完整串联 OGE 平台（oge-server）现有接口，演示「登录 →
上传数据 → 我的数据 → 产品 → 影像 → 执行算子 → 状态 → 结果」全流程，并提供独立的结果渲染页。
 接口均来自 oge-server 仓库现有服务，前端只做 HTTP 调用，不新增后端代码。

# 一、架构与调用链
 ┌───────────────────────── 浏览器 ─────────────────────────┐
 │ index.html（主流程） / viewer.html（结果渲染）                      │
 │ 纯静态，零依赖；无任何后端逻辑                                         │
 └──────────────┬──────────────────────────┬────────────────┘
                │ 系统设置：网关 Base URL          │
                ▼                           ▼
 ┌───────────────────────────────────────────────────────────┐
 │                平台统一 Nginx（平台侧，非本案例）                        │
 │ 静态资源托管 /oge-case/ · 可选代理 /gateway 或加 CORS                  │
 └──────────────────────────────┬────────────────────────────┘
                                ▼
 ┌───────────────────────────────────────────────────────────┐
 │            oge-server 网关（openge.org.cn/api）           │
 │   JwtAccessManager（Bearer JWT）· OpenApiAuthFilter（tk） │
 └──────┬──────────┬──────────┬──────────────┬───────────────┘
        ▼          ▼          ▼               ▼
    user/oauth asset      data-product   computation-api
    登录鉴权       上传/列表 产品/影像              算子执行/状态/结果




![系统架构与调用链](OGE%20OpenAPI%20开发者手册_files/architecture.png)

## 鉴权双轨（关键设计）
链路                                  凭证                            携带方式
登录/上传/列表/产品/影像/状态/          用户 JWT（登录接口换取）        Authorization: Bearer
结果                                                &lt;token&gt;


算子执行/openapi/**             应用凭证tk（appKey，平台申 URL 参数?tk=apk.xxx 或 header
                            请）                    tk

 网关 OpenApiAuthFilter 拦截 /openapi/**：校验 tk 有效性、白名单（Origin）、算子发布状态（未
 发布返回 403 该服务未发布）。

# 二、目录结构
 oge-openapi-case/
 ├── index.html                  # 主流程前端（8 步向导，单文件含全部 CSS/JS）
 ├── viewer.html                 # 结果渲染页（独立：输入 processId 加载渲染结果）
 ├── Dockerfile                  # 镜像构建：纯静态托管（nginx 默认配置）
 ├── compose.yml                 # Docker Compose 编排（端口可用环境变量覆盖）
 ├── .dockerignore               # 构建上下文忽略
 ├── images/                     # 界面截图存放目录（预留）
 └── README.md                   # 本手册




# 三、前置条件

<!-- 原 PDF 第 2 页 -->
项                          说明                                                             获取方式
网关地址                       http://openge.org.cn/api                                       平台环境
OAuth client_id /          登录接口/oauth/token 所需                                            默认test /
client_secret                                                                             123456

OpenAPI 应用凭证tk             算子执行接口/openapi/** 鉴权用                                          管理后台申请
用户账号                       平台登录账号                                                         平台注册
                           Coverage.terrSlope 等需在管理后台发布为 OpenAPI 服                        管理后台「服务
已发布的算子                     务，否则执行返回 403                                                   发布」

# 四、功能与使用流程（界面操作）
## 4.0 OpenAPI 开发者使用流程（API 视角，推荐）
对接已注册的 OpenAPI 服务时，按以下 6 步串联（各步详细接口见第五章）：
 步 动作 接口（相对网关 Base URL）                                                                              凭证
 骤
 1 注册账
   号      平台注册 / 管理员开通账号，然后POST /oauth/token 登录                                                      无

 2 申请
   AppKey POST /open/app/key/create（{appName, industryIds, whitelist}）                               JWT

3 上传文
   件      POST /asset/myData/upload（multipart：file + 元数据）                                 JWT
   用
   AppKey
4 +传的文
    刚上 POST /openapi/algorithm/{包}/{算子}/execute?tk=apk.xxx（body = args，输入引用
          Personal:MyData:myData/文件名）
                                                                                          tk
   件执行
   算子
   用
5 jobId   GET /computation-api/process/{processId}?tk=apk.xxx（OpenAPI 场景同样带 tk，第三方无
   查执行 JWT）                                                                               tk
   状态
   下载 / GET /computation-
6 可视化 api/process/result/{processId}、/result/download/{processId}、/styles/cog/{processId} JWT
   结果
 凭证分工：第 2 步申请的 appKey（tk）用于第 4 步执行、第 5 步状态查询——OpenAPI 第三方调用者
 没有平台 JWT，状态查询同样以 tk 鉴权；第 1、3、6 步用第 1 步登录拿到的 JWT。执行返回的
 processId 贯穿第 5、6 步。


  # ===== 1. 登录（拿到 JWT，password 为 MD5）=====
  TOKEN=$(curl -s -X POST http://openge.org.cn/api/oauth/token \
    -d 'grant_type=password&username=&lt;账号&gt;&password=&lt;MD5&gt;&client_id=&lt;id&gt;&client_secret=&lt;secret&gt;' \
    | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["token"])')

  # ===== 2. 申请 AppKey（拿到 tk）=====
  TK=$(curl -s -X POST http://openge.org.cn/api/open/app/key/create \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d '{"appName":"我的应用"}' \
    | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["appKey"])')

  # ===== 3. 上传文件（拿到的引用：Personal:MyData:myData/数据文件名）=====
  curl -X POST http://openge.org.cn/api/asset/myData/upload \
    -H "Authorization: Bearer $TOKEN" \

<!-- 原 PDF 第 3 页 -->
  -F "file=@/path/data.tif" -F "assetName=data" -F "dataType=grid"

# ===== 4. 用 tk + 刚上传的文件执行算子 =====
JOB=$(curl -s -X POST "http://openge.org.cn/api/openapi/algorithm/Coverage/terrSlope/execute?tk=$TK" \
  -H "Content-Type: application/json" \
  -d '{"coverage":"Personal:MyData:myData/data.tif","outputName":"slope_result.tif"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["processId"])')

# ===== 5. 用 jobId 查执行状态（OpenAPI 场景同样带 tk）=====
curl -s "http://openge.org.cn/api/computation-api/process/$JOB?tk=$TK"

# ===== 6. 下载 / 可视化结果 =====
curl -s -o result.tif "http://openge.org.cn/api/computation-api/process/result/download/$JOB" \
  -H "Authorization: Bearer $TOKEN"
# COG 预览：GET /computation-api/styles/cog/{processId}




1. 系统设置（右上角 ⚙）：填网关 Base URL、client_id / client_secret、tk，保存到浏览器本地。
2. 步骤 1 登录：输入用户名/密码（明文）→ POST /oauth/token（query 携带 scopes/client 凭据，
   body 携带 username/password）→ 拿到 JWT，后续请求自动携带。
3. 步骤 2 申请 AppKey：点击「开放平台-应用管理」申请 appkey（apk.xxx 格式），执行算子时作为 tk
   使用。




![AppKey 注册界面](OGE%20OpenAPI%20开发者手册_files/appkey-registration.png)

4. 步骤 3 上传数据（界面操作）：① 点击「个人中心-上传数据」→ ② 填写影像名称等元数据。




![上传数据界面](OGE%20OpenAPI%20开发者手册_files/data-upload.png)

5. 步骤 4 执行算子：填算子名 → 「输入数据来源」二选一（上传数据 / 平台数据）→ 「获取算子定义」查
   看参数 → 「填入输入引用」→ 编辑 args JSON → 「▶ 执行算子」→ 拿到 processId。用刚上传的数
   据以及申请的 appkey 即可调用平台已发布的服务以及算子。

<!-- 原 PDF 第 4 页 -->
![执行算子界面](OGE%20OpenAPI%20开发者手册_files/algorithm-execute.png)

6. 步骤 5 执行状态：支持 3s 自动轮询；tif 结果自动展示 bandStats，geojson 结果自动渲染。




![执行状态界面](OGE%20OpenAPI%20开发者手册_files/execution-status.png)

7. 步骤 6 执行结果（界面操作）：点「⬇ 下载结果文件」保存到本机，点「COG 预览」在线查看影像。

<!-- 原 PDF 第 5 页 -->
![结果下载界面](OGE%20OpenAPI%20开发者手册_files/result-download.png)

# 五、接口协议
## 5.1 接口清单
功能   方法 路径（相对网关 Base URL）                                                鉴权
登录   POST /oauth/token  （query：scopes=web, client_id, client_secret,     无
          grant_type=password；body：username, password 明文）
          /asset/myData/upload（multipart：file, assetName, assetType,
上传数据 POST dataType, phenomenonTime, belongingArea, productLevel,         JWT
          productResolution）
我的数据 POST /asset/myData/list（JSON：pageNumber, pageSize, keywords,        JWT
列表        dataType）
产品列表 POST /data-product/page  （JSON：pageNum, pageSize, type 0影像/1矢量,     JWT
          keywords, status=1）
产品影像 GET /data-product/image/listByProductId?productId=                  JWT
列表
算子定义 GET /computation-api/process/info?processName=Coverage.terrSlope    JWT
执行算子 POST /openapi/algorithm/{包}/{算子}/execute  （JSON body = 算子 args；需    tk
            带 tk）
执行状态 GET /computation-api/process/{processId}                            JWT
执行结果 GET /computation-api/process/result/{processId}                     JWT
结果下载 GET /computation-api/process/result/download/{processId}            JWT
COG 预 GET /computation-api/styles/cog/{processId}                        JWT
览
注册
AppKey POST /open/app/key/create（JSON：appName, industryIds, whitelist）   JWT
行业类别 GET /open/app/key/industries                                        JWT
列表
执行组合 POST /openapi/combination/{serviceName}/execute（JSON body = 模型参     tk
模型          数；需带 tk）

## 5.2 接口详细说明
  以下所有路径均为相对网关 Base URL（线上默认 http://openge.org.cn/api）。成功响应统一为
  ResponseResult：{"code":20000,"msg":"成功","data":...}（不同服务 success code 略有差
  异，实测 data-product 为 20000，以业务数据是否返回为准）。失败时 code 非 0 且 msg 为错误信息。
### 5.2.1 登录

<!-- 原 PDF 第 6 页 -->
  POST http://openge.org.cn/api/oauth/token
    query：scopes=web & client_secret=123456 & client_id=test & grant_type=password
    body ：multipart/form-data（FormData）：username / password（明文）




参数            位置 必填 说明
grant_type    query 是 固定password
client_id     query 是 线上默认test
client_secret query 是 线上默认123456
scopes        query 是 固定web
username      body 是 平台账号（示例edu_admin）
password      body 是 明文密码（线上实测为明文传输，非 MD5）
  curl -X POST "http://openge.org.cn/api/oauth/token?
  scopes=web&client_secret=123456&client_id=test&grant_type=password" \
    -F "username=edu_admin" -F "password=&lt;明文密码&gt;"




  {"code":20000,"msg":"成功","data":{"token":"eyJhbGciOi...","refreshToken":"...","tokenHead":"Bearer
  ","expiresIn":7200,"exp":1786000000,"refreshExpiresIn":2592000,"refreshExp":1788000000}}




  后续业务接口一律携带 Authorization: Bearer &lt;token&gt;。exp 为过期时间戳（秒）。 实测错误码：
  缺参 {"code":40000,"msg":"参数为空"}；账号密码错误 {"code":50000,"msg":"...账号或密码错
  误，失败五次将被锁定。剩余失败次数: N"}（注意：连续错误 5 次账号会被锁定，联调勿用真实账号
  乱试密码）。
### 5.2.2 上传数据（我的数据）
  POST /gateway/asset/myData/upload       Content-Type: multipart/form-data          鉴权：JWT




表单字段              必填 说明
file              是 文件（tif/geojson 等）
assetName         是 资产名称（不带后缀，前端默认取文件名）
assetType         否 资产类型（如mydata、landsat）
dataType          是 grid（栅格）/ vector（矢量）
phenomenonTime    否 采集时间，格式yyyy-MM-dd
belongingArea     否 所属区域
productLevel      否 产品等级（如 L1T）
productResolution 否  产品分辨率
assetUuid         否 留空由平台生成
  curl -X POST http://openge.org.cn/api/asset/myData/upload \
    -H "Authorization: Bearer &lt;token&gt;" \
    -F "file=@/path/data.tif" -F "assetName=data" -F "assetType=mydata" -F "dataType=grid"




  {"code":20000,"msg":"成功","data":true}




  上传成功后可到「我的数据列表」确认；列表默认取前 50 条。
### 5.2.3 我的数据列表

<!-- 原 PDF 第 7 页 -->
  POST /gateway/asset/myData/list        Content-Type: application/json        鉴权：JWT




参数                                必填 说明
pageNumber                        否 页码，默认 1
pageSize                          否 每页条数，默认 10
keywords                          否 关键字模糊查询
dataType                          否 grid / vector 筛选
assetStatus / startTime / endTime 否  状态 / 时间范围筛选
  curl -X POST http://openge.org.cn/api/asset/myData/list \
    -H "Authorization: Bearer &lt;token&gt;" -H "Content-Type: application/json" \
    -d '{"pageNumber":1,"pageSize":10}'




  {"code":20000,"msg":"成功","data":{"pages":2,"currentPage":1,"total":12,"pageSize":10,"records":
  [{"assetId":1001,"assetUuid":"...","assetName":"data","assetExt":"tif","assetSize":1048576,"dataType":"g
  rid","assetStatus":"normal","uploadTime":"2026-08-06 10:00:00"}]}}




  每条记录的 assetUuid 可用于输入引用 Personal:Asset:{assetUuid}；文件名 = assetName + . +
  assetExt。

### 5.2.4 产品列表
  POST /gateway/data-product/page        Content-Type: application/json        鉴权：JWT




参数                    必填 说明
pageNum / pageSize    否 分页，默认 1 / 10
type                  否 0-影像产品，1-矢量产品
keywords / name       否 模糊查询
status                否 1-已发布（默认）
sortType / isSortDesc 否  排序
  curl -X POST http://openge.org.cn/api/data-product/page \
    -H "Authorization: Bearer &lt;token&gt;" -H "Content-Type: application/json" \
    -d '{"pageNum":1,"pageSize":2,"status":1}'




  {"code":20000,"msg":"获取成功","data":{"pages":74,"currentPage":1,"total":148,"pageSize":2,"records":
  [{"id":5070,"type":0,"name":"LC09_C02_L2","alias":"Landsat-9 Collection 02 SR","status":1}]}}




 records[].name    为产品名（用于 Platform:Coverage:影像标识:产品名 引用）；id 用于查影像列
  表。
### 5.2.5 产品影像列表
  GET /gateway/data-product/image/listByProductId?productId=&lt;id&gt;          鉴权：JWT




参数                  必填 说明
productId           是 产品 id（来自产品列表records[].id）
imageIdentification 否  影像标识模糊查询

<!-- 原 PDF 第 8 页 -->
  curl "http://openge.org.cn/api/data-product/image/listByProductId?productId=5070" \
    -H "Authorization: Bearer &lt;token&gt;"




  {"code":20000,"msg":"成功","data":
  [{"imageId":9001,"productId":5070,"imageIdentification":"LC81220392015275LGN00","path":"...","crs":"EPSG
  :32650","phenomenonTime":"2015-10-01
  02:31:00","coverCloud":3.2,"upperLeftLong":112.3,"upperLeftLat":31.2}]}




 imageIdentification        用于输入引用 Platform:Coverage:{imageIdentification}:{产品名}。
### 5.2.6 算子定义查询
  GET /gateway/computation-api/process/info?processName=Coverage.terrSlope       鉴权：JWT




参数          必填 说明
processName 是  算子名，点号分隔，如Coverage.terrSlope
  curl "http://openge.org.cn/api/computation-api/process/info?processName=Coverage.terrSlope" \
    -H "Authorization: Bearer &lt;token&gt;"




  {"code":20000,"msg":"成功","data":{"name":"Coverage.terrSlope","output":{"name":"outputName"},"args":
  {...},"type":2}}




 data  为算子定义 JSON（存于数据库 oge_model_collection）：重点关注 output.name（输出文件名
  字段键，执行时必须提供）与 args 结构（参数表单依据）。tif 类算子 type=2（Docker 执行）。
### 5.2.7 执行算子
  POST /gateway/openapi/algorithm/{包}/{算子}/execute            鉴权：tk




 说明 值
 路径 如 Coverage.terrSlope → /openapi/algorithm/Coverage/terrSlope/execute；多级包用
    / 分隔

 请求 算子 args JSON 本身（服务端自动包 {name, args, invokeSource:"openapi"}）
 体
 鉴权 URL 参数?tk=apk.xxx 或 header tk: apk.xxx
请求体示例（以 NDVI 类算子为例）：
  {
      "coverage": "Platform:Coverage:LC81220392015275LGN00:LC09_C02_L2",
      "redBandName": "B4",
      "nirBandName": "B5",
      "outputName": "case_result.tif"
  }




  curl -X POST "http://openge.org.cn/api/openapi/algorithm/Coverage/terrSlope/execute?tk=apk.xxx" \
    -H "Content-Type: application/json" \
    -d '{"coverage":"Platform:Coverage:...","outputName":"case_result.tif"}'




  {"code":20000,"msg":"成功","data":{"processId":"job-&lt;uuid&gt;","taskName":"job-&lt;uuid&gt;","status":"running"}}

<!-- 原 PDF 第 9 页 -->
  异步执行返回 processId（job- 前缀）；必须包含输出文件名（键 = 算子定义 output.name），且同一
  用户不能重名（任务名称已存在）。tk 无效返回 401 凭证无效，算子未发布返回 403 该服务未发布。
### 5.2.8 执行状态查询
  GET /gateway/computation-api/process/{processId}          鉴权：JWT




  curl "http://openge.org.cn/api/computation-api/process/job-xxx" \
    -H "Authorization: Bearer &lt;token&gt;"




  {"code":20000,"msg":"查询状态成功","data":{"id":1,"recordId":"job-
  xxx","algorithmName":"Coverage.terrSlope","algorithmResultName":"case_result.tif","filePath":"
  &lt;userId&gt;/result/","resultStatus":2,"message":null,"bandStats":
  {"width":1200,"height":900,"minValue":0,"maxValue":255}}}




字段            说明
 resultStatus 0-未开始 / 1-运行中 / 2-成功 / 3-失败（以平台实际为准）

 bandStats    tif 结果的 COG 元数据（栅格）
 vectorTms    geojson 结果内容（矢量，含content/geometryType/crs）
 jsonResult   json 结果
### 5.2.9 执行结果信息
  GET /gateway/computation-api/process/result/{processId}       鉴权：JWT




  curl "http://openge.org.cn/api/computation-api/process/result/job-xxx" \
    -H "Authorization: Bearer &lt;token&gt;"




  {"code":20000,"msg":"成功","data":{"jobId":"...","processId":"job-xxx","status":"SUCCESS","outputs":
  {"resultPath":"..."}}}




 status 为引擎执行状态（SUCCESS/FAILED 等）；outputs 含结果文件路径信息。
### 5.2.10 结果下载
  GET /gateway/computation-api/process/result/download/{processId}          鉴权：JWT




返回文件流（二进制），前端用 fetch blob + Authorization 头下载（网关不认 query 传 token，勿用 &lt;a
href&gt; 直链）  。
### 5.2.11 COG 预览
  GET /gateway/computation-api/styles/cog/{processId}         鉴权：JWT




返回图片流，用于在线预览 tif 结果；非图片返回时前端提示加载失败。
### 5.2.12 注册 AppKey（申请 OpenAPI 应用凭证）
  截图：AppKey 注册界面（平台管理后台）
  POST /gateway/open/app/key/create        Content-Type: application/json       鉴权：JWT

<!-- 原 PDF 第 10 页 -->
参数          必          说明
            填
appName     是     应用凭证名称，最长 200 字符，仅允许汉字/字母/数字/-/_
industryIds 否
                  行业类别 ID 列表，最多 3 个（可先调GET /open/app/key/industries 查询可选
                  行业）
whitelist       否 白名单域名，半角分号
                  不在白名单返回 403
                               ; 分隔，不填表示无限制；填写后网关按请求 Origin 校验，




  # ① 查询可选行业类别
  curl "http://openge.org.cn/api/open/app/key/industries" \
    -H "Authorization: Bearer &lt;token&gt;"

  # ② 申请应用凭证（appKey）
  curl -X POST http://openge.org.cn/api/open/app/key/create \
    -H "Authorization: Bearer &lt;token&gt;" -H "Content-Type: application/json" \
    -d '{"appName":"我的应用","industryIds":
  [1,5],"whitelist":"https://example.com;https://dev.example.com"}'




  {"code":20000,"msg":"成功","data":{"id":101,"appName":"我的应
  用","appKey":"apk.XXXXXXXXXXXXXXXXXXXXXXXXXXX","appKeySuffix":"abc123","expireTime":"2027-08-06
  00:00:00"}}




      data.appKey 为完整应用凭证（格式 apk. + UUID 去连字符大写），只展示一次，请妥善保存；
       appKeySuffix 为后 6 位，用于列表里脱敏识别；
       凭证有效期为 1 年（expireTime），到期需重新申请或续期；
       该凭证即执行接口的 tk（URL 参数 ?tk=apk.xxx 或 header tk: apk.xxx）。
### 5.2.13 调用已注册服务（使用 AppKey 执行 OpenAPI 服务）
  截图：调用已注册服务执行界面
拿到 appKey 后即可作为 tk 调用已发布的 OpenAPI 服务。当前支持两类：
 服务类型 方法 路径（相对网关 Base URL）                                       请求体
 算法算子 POST /openapi/algorithm/{包}/{算子}/execute?tk=apk.xxx        算子 args JSON
 组合模型 POST /openapi/combination/{serviceName}/execute?tk=apk.xxx 模型参数 JSON
  # 算法算子（同 5.2.7）
  curl -X POST "http://openge.org.cn/api/openapi/algorithm/Coverage/terrSlope/execute?tk=apk.xxx" \
    -H "Content-Type: application/json" \
    -d '{"coverage":"Platform:Coverage:...","outputName":"case_result.tif"}'

  # 组合模型
  curl -X POST "http://openge.org.cn/api/openapi/combination/坡度分析模型/execute?tk=apk.xxx" \
    -H "Content-Type: application/json" \
    -d '{"coverage":"Platform:Coverage:...","outputName":"slope_result.tif"}'




  {"code":20000,"msg":"成功","data":{"processId":"job-&lt;uuid&gt;","taskName":"...","status":"running"}}




      执行前需在管理后台将算子/组合模型发布为 OpenAPI 服务，否则返回 403 该服务未发布；
      tk 无效/过期返回 401 凭证无效；Origin 不在白名单返回 403；
      组合模型执行路径与算法一致（异步返回 processId），状态/结果查询复用 5.2.8~5.2.10；
      调用会产生调用量记录（oge_app_key_usage），可在应用凭证详情查看。
## 5.3 登录与鉴权细节
   密码为明文传输：线上实测（浏览器请求）username/password 以 multipart body 明文提交，不做
   MD5；oge-server-oauth 的 PasswordEncoder 为明文比较（matches 即 equals），与线上行为一
   致。注意：连续错误 5 次账号会被锁定。

<!-- 原 PDF 第 11 页 -->
  client 凭据：存于数据库 t_oauth_client_details 表；线上默认 test / 123456。
  Token 有效期：登录响应 data.token（JWT）+ exp（秒级时间戳）。
## 5.4 算子执行请求体（args）
   body 就是算子的参数 JSON（OpenApiAlgorithmController 直接透传），服务端自动包一层 {name,
   args, invokeSource:"openapi"}。
   必须包含输出文件名，键为算子定义 output.name（常见 outputName），且同一用户不能重名（任务名
   称已存在）   。
   输入数据引用协议（字符串直接写进 args 对应字段）：
引用               格式
我的数据             Personal:MyData:myData/文件名

个人资产             Personal:Asset:{assetUuid}

我的处理结果           Personal:Process:{processId}

平台单景影像           Platform:Coverage:{imageIdentification}:{productName}

平台产品影像集合 Platform:Product:Coverage:{productName}:{imageId1,imageId2}
平台产品             Platform:Product:{productName}

天地图在线            Tms:{tileUrl}

 协议解析位于 oge-server-computation-api 的
 LegacyRequestMappingService.parseLegacyProtocol；算子定义存于数据库
 oge_model_collection（代码内置模板仅 NDVI/NDBI/NDWI）       。
## 5.5 响应结构
  执行：异步 {"processId":"job-xxx","taskName":"job-xxx","status":"running"}；同步
  {"status":"success","processId":"...","resultPath":"..."} 或 fail
  状态：resultStatus（0-未开始 / 1-运行中 / 2-成功 / 3-失败，以平台实际为准）；tif 带 bandStats，
  geojson 带 vectorTms，json 带 jsonResult
  结果：JobResultResponse{jobId, processId, status, outputs}

# 六、前端代码结构
两个页面均为单文件（内联 CSS/JS），无构建步骤、无外部依赖。
## 6.1 index.html（主流程页）
模 关键函数                            说明
块
全                                                                    、选中项
局 S                               token/baseUrl/clientId/clientSecret/tk
                                                             、dataSource
状                                 myDataSel/productSel/imageSel
                                  （upload/platform/custom）、轮询定时器
态
通
用 req / authHeaders / fmtErr      统一 fetch 封装、Bearer 注入、错误格式化（401/403/网络）
请
求
系
统 loadSettings / saveSettings /   localStorage（keyoge_case_cfg）持久化
设 renderCfgTip
置

<!-- 原 PDF 第 12 页 -->
模 关键函数                              说明
块
步
骤                                   明文密码 + FormData →/oauth/token → 存
1 doLogin / clearToken              oge_case_token（供 viewer 读取）
登
录
步
骤
2 doUpload                          multipart 提交
上
传
步
骤
3 loadMyData / selMyData /
我 fmtSize                           列表加载、选中、自动刷新步骤 6 引用
的
数
据
步
骤
4 loadProducts / selProduct         分页、选中
产
品
步
骤
5 loadImages / selImage             按产品加载、选中
影
像
步 setDataSource  / fillInputRef /
  fillOutputName /
骤 loadAlgorithmDef /                数据来源二选一、args 编辑、调
6 genArgsTemplate /                 用/openapi/algorithm/**/execute
执 algorithmParts / doExecute /
行 useProcessId
步
骤 queryStatus / startPolling /
7 stopPolling /                     查询 + 3s 轮询 + 结果预渲染
状 renderStatusResult
态
步
骤 loadResult / downloadResult /
8 toggleCogPreview /                结果获取、blob 下载、COG 预览、geojson→SVG
结 renderGeojson
果

## 6.2 viewer.html（结果渲染页）
模块     关键函数                                    说明
加载     loadAll / loadResultJson                状态 + 结果两个接口
渲染     renderViz / renderGeojson               tif 元数据表格 / geojson SVG / json 展示
操作     downloadResult / toggleCog / togglePoll 下载、COG 预览、3s 自动刷新

<!-- 原 PDF 第 13 页 -->
模块 关键函数                                       说明
初始化 URL 参数 → localStorage → 默认值               ?processId=&base=&token=   支持分享直开

## 6.3 localStorage 键约定
键               写入          读取          用途
oge_case_cfg    index.html index.html 系统设置（网关/凭据/tk）
oge_case_token  index.html viewer.html 登录 Token，两页联动
oge_case_viewer viewer.html viewer.html viewer 上次填写内容



# 七、二次开发指南ry
新增算子（页面下拉里加）：
 1. 在 index.html 的 &lt;datalist id="algorithmList"&gt; 加 &lt;option value="包.算子名"&gt;
 2. 点「获取算子定义」（/process/info）查看参数结构，按 output.name 填输出文件名
 3. 算子需在管理后台发布为 OpenAPI 服务
修改默认网关地址：loadSettings() 中 cfgBaseUrl 的默认值；部署后用户在页面「系统设置」可改，保
存在本地。
扩展结果渲染（新增结果类型）：
    index.html：renderStatusResult() 加类型分支；viewer.html：renderViz() 加类型分支
新增功能步骤：复制一个 .card 区块（含步骤导航锚点），编写对应函数并挂到按钮 onclick，函数清单见第
六节。
重新打包：改完前端后 docker build -t oge-openapi-case:latest .（静态文件无构建，直接生效）。

# 八、部署（纯静态资源，平台统一 Nginx 接入）
本案例是纯静态前端资源，不携带任何 nginx 配置；接口代理由平台统一 Nginx 负责。
## 8.1 方式一：Docker 镜像
  cd oge-openapi-case
  docker build -t oge-openapi-case:latest .
  docker compose up -d --build
  # 访问：http://&lt;服务器IP&gt;:18080/oge-case/




    端口用环境变量 APP_PORT 覆盖：APP_PORT=28080 docker compose up -d --build
    docker run 等价命令：docker run -d --name oge-openapi-case -p 18080:80 --restart
    unless-stopped oge-openapi-case:latest
    镜像基于 nginx:1.27-alpine 默认配置（仅静态托管）
## 8.2 方式二：直接放平台静态目录
把 index.html、viewer.html 放到平台任意静态目录（如 /usr/local/nginx/html/oge-case/）即可。
## 8.3 平台统一 Nginx 接入要求（平台侧配置）
前端通过「系统设置」的网关 Base URL 直连后端网关（默认 http://openge.org.cn/api）。平台 Nginx
满足其一即可：

<!-- 原 PDF 第 14 页 -->
 1. 已有 /gateway → 后端网关的代理——无需任何改动；
 2. 若前端与网关不同源且网关未开 CORS：平台 Nginx 给网关接口加 CORS 头。
## 8.4 验证
  curl http://&lt;服务器IP&gt;:18080/oge-case/index.html  # 200，主流程页
  curl http://&lt;服务器IP&gt;:18080/oge-case/viewer.html # 200，结果渲染页
  # 完整链路：打开页面 → 系统设置填网关地址 → 登录 → 走全流程




## 8.5 镜像导出/导入（离线环境）
  docker save oge-openapi-case:latest | gzip &gt; oge-openapi-case.tar.gz
  docker load &lt; oge-openapi-case.tar.gz




## 8.6 结果渲染页 viewer.html
输入 processId 即可加载渲染算子结果（tif 元数据 / geojson 可视化 / COG 预览 / 下载），适合单独分享结
果。三种打开方式：
 方式          说明
 页面填写 填网关 Base URL + Token + processId，点「加载并渲染」
 URL 参数分 viewer.html?processId=job-xxxx&base=http://&lt;IP&gt;:&lt;端口
 享           &gt;/gateway&token=xxx，打开即自动加载

 同源联动 主页面登录后 viewer 自动读取 Token，只需填 processId

# 十一、常见问题
现象       原因/解法
登录返回 401 client_id / client_secret 不对，或账号密码错误（连续错误 5 次账号锁定）；确认
         t_oauth_client_details 中 client 已启用

执行算子返回
403 该服务未 算子未在管理后台发布为 OpenAPI 服务，联系管理员发布
发布

注册 AppKey 应用名称格式不合法（仅汉字/字母/数字/-/_）、行业类别超 3 个、白名单超 500 字符；按
报错        响应 msg 修正
调用返回403 请求Origin 不在 AppKey 注册时填写的 whitelist 内；补白名单或申请时留空（无限
白名单校验不
通过
          制）
调用返回401 tk 拼写错误、凭证已禁用/过期（expireTime 到期）；重新申请 AppKey
凭证无效

执行返回任务 换一个输出文件名（同一用户下不能重名）
名称已存在

上传成功但列 分页取前 50 条；确认上传时的dataType 与筛选一致
表看不到
页面接口报跨 前端与网关不同源且网关未开 CORS：平台 Nginx 给网关接口加 CORS 头，或将/gateway
域      代理到后端网关（见 8.3）
tk 无效  应用凭证已禁用/过期，或在平台白名单外（白名单校验 Origin 头）

<!-- 原 PDF 第 15 页 -->
现象      原因/解法
状态一直    算子为异步执行，等 3s 轮询；长时间不结束查后端日志
running /oge_algorithm_processing_result 表
部署后外部访 服务器防火墙未放行映射端口：             firewall-cmd --permanent --add-port=18080/tcp
        && firewall-cmd --reload；容器内自检 docker exec &lt;容器&gt; wget -q -O -
问不通     http://127.0.0.1/oge-case/index.html 返回 200 即说明镜像没问题
