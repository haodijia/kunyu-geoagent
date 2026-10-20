# OGE 平台接入

根据 `docs/api.md` 接入账号登录、四个公开数据接口及我的数据列表和详情。入口为「设置 → OGE 平台」，账号操作与模型工具分开。公开影像接口不要求登录；我的数据及计算接口使用本机保存的登录信息，令牌过期后自动重新登录。工具始终注册，不因未登录隐藏。

## 工具目录

```text
agent/tools/
├── filesystem/          # read、read_image、write、edit、glob、grep
├── context/             # memory_read/write、skill/resource
├── workflow/            # ask_user_question、exit_plan_mode、todo、subagent 系列
├── oge/
│   ├── arguments.py     # 日期、区域、云量和分页参数
│   ├── find_regions.py
│   ├── search_images.py
│   ├── image_detail.py
│   ├── image_preview.py
│   ├── my_data.py
│   └── shared.py        # OGE 工具的公共归属、校验和错误转换
├── registry.py
└── shared.py
```

同一平台的工具平铺在 `oge/`，不再按 API 类别拆子目录。已同步更新旧工具的插件引用，旧模块路径不保留兼容转发。

## 登录设置

| 本地接口 | 用途 |
| --- | --- |
| `GET /api/v1/oge/account` | 自动续期后读取登录状态、平台地址、账号与令牌过期时间 |
| `POST /api/v1/oge/account/login` | 接受 `base_url`、`username`、`password`，按文档的 multipart 协议登录 |
| `DELETE /api/v1/oge/account` | 清除本机账号、密码和令牌；不调用未提供的远端撤销接口 |

API 沿用 Electron 的桌面会话鉴权。页面仅返回账号与有效期，不返回密码、访问令牌或刷新令牌。密码按平台要求保留原值，用于自动重新登录，不做 MD5。上游的 OAuth 客户端参数严格采用文档值。

账号、密码和令牌保存在应用数据目录的业务数据库 `kunyu.db` 的 `oge_account` 中，数据库文件权限为 `0600`。这是本机私有存储，不是加密凭据库，不属于 Agent 的工作区文件挂载。凭据不进入工具参数、结果或模型上下文；密码在模型序列化和对象展示时隐藏，仅持久化入口显式读取原值。读取到损坏数据时明确报错。

文档没有提供刷新接口，因此使用已保存的账号密码调用现有登录接口。设置页状态读取及授权业务请求会检查令牌，在有效期不足一分钟时自动重新登录。个人数据、算子查询、计算提交、后台轮询和结果下载共用 `OgeAuth` 与同一把异步锁，并发请求只进行一次登录。HTTP 401/403 或业务码 40003 表明令牌被拒绝时，重新登录后仅重试被拒绝的请求一次；网络错误、超时及其他业务失败不会触发重放计算。结果下载也识别 HTTP 200 的 JSON 鉴权错误。

自动登录若被拒绝，会持久标记需要更新凭据，停止继续尝试，避免平台因连续密码错误锁定账号；临时网络错误保留凭据。手动登录成功后清除此标记，手动登录失败不替换此前保存的账号。退出登录会清除本机账号、密码和令牌；退出后恢复默认平台地址。旧账号此前没有保存密码，需要成功登录一次才能启用自动重连。

## 数据工具

| 名称 | 输入／结果 |
| --- | --- |
| `oge_find_regions` | 输入仅含地名 `query` 和可选上级名称 `parent_name`；返回列表，每项仅含 `code`、`level`、`name`、`name_en`、`path` |
| `oge_search_images` | 时间范围、行政区／闭合多边形／矩形三选一、可选产品 ID 和云量、页码；每页固定请求 100 景，输出仅含 `page`、`next_page`、`images`，末页 `next_page=null` |
| `oge_get_image_detail` | image_id；返回完整详情，data=null 明确报不存在 |
| `oge_get_image_preview` | 输入仅 `image_id`；通过已有附件机制持久保存，返回预览图片及 `file_path`；仅供预览，无地理参考，不自动上图 |
| `oge_list_my_data` | 输入 `page`、可选 `keywords` 和 `data_type`，每页固定请求 100 个资产；输出仅含 `page`、`next_page`、`assets`，末页 `next_page=null`；每项保留 assetUuid 和 Personal:Asset 引用 |
| `oge_get_my_data_detail` | asset_uuid；返回完整资产详情、bandStats（如有）和 Personal:Asset 引用 |

行政区树按平台地址缓存一小时；只向 Agent 返回匹配候选，重名不会自动选第一个。各地层级使用平台返回值，县级为 4，不推测代码。坐标使用 WGS84，经纬度边界、闭合多边形、日期和云量均在发出请求前校验。

我的数据列表向 `POST /asset/myData/list` 发送 JSON，分页字段为 `pageNumber`、`pageSize`；详情使用 `GET /asset/myData/detail?assetUuid=...`。登录令牌只在后端加入 Authorization，不出现在工具参数和结果中。列表提供紧凑摘要，详情保留平台完整字段；内部 filePath、cogPath 不视为下载链接。地图定位使用 bandStats 的 WGS84 字段，原始四角字段可能是投影坐标。不能仅凭 assetStatus 判断是否可分析，应结合实际详情和算子结果。

平台无效令牌的业务错误可能省略 data；按 code=40003 识别鉴权失败，成功响应仍必须包含 data。未登录返回 OGE_AUTH_REQUIRED，缺少已保存密码而无法续期返回 OGE_AUTH_EXPIRED，保存的凭据或重连后的令牌被拒绝返回 OGE_AUTH_REJECTED。

检索结果包括影像身份、产品、任务、采集时间、云量、分辨率、CRS 与四角坐标。详细元数据按需单独读取；平台内部 `path` 不视为下载地址。业务 JSON 与预览 PNG 有独立字节上限；HTTP 200 的业务错误、JSON 形式的预览失败、网络错误和超时都转换为明确工具错误，并记录日志。

预览复用会话附件、工具来源标记、图像归一化与当前请求模型的图片预算。当前模型未开启图片输入时明确拒绝。预览只是一张非地理参考缩略图，不自动添加到 MapLibre，不代表原始遥感影像或分析产物。

## 核查记录

早期版本的真实公开接口完成榕江县检索链路：定位 `522632 / level=4`，2025 年 6 月查询返回 224 条记录，读取首景详情并解码 PNG 预览。当时不保存密码，登录协议、私有存储、响应不回传令牌和退出清除通过隔离数据目录与模拟上游响应核查；没有使用文档示例中的真实账号。

2026-10-13 新增我的数据工具：使用只读数据库中的真实运行上下文确认全部 6 个 OGE 工具注册及新工具参数校验；保存的 6 条贵港资产实际响应与新模型兼容。当前登录已过期，两工具明确返回 OGE_AUTH_EXPIRED；真实无令牌列表请求的 code=40003、缺少 data 响应正确分类为 OGE_AUTH_REJECTED。未验证有效登录后的完整成功调用。Python Ruff、编译检查和前端 TypeScript 检查通过，未新增测试文件。

2026-10-17 增加凭据持久化和统一自动重连：前端生产构建、Python Ruff、语法及接口模块导入、架构检查通过。未使用真实账号进行自动重新登录或计算提交验证。
