# OGE 平台接入

根据 `docs/api.md` 接入账号登录和四个公开数据接口。入口为「设置 → OGE 平台」，账号操作与模型工具分开。当前数据接口不要求登录，工具始终注册，不因未登录隐藏。

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
│   └── shared.py        # OGE 工具的公共归属、校验和错误转换
├── registry.py
└── shared.py
```

同一平台的工具平铺在 `oge/`，不再按 API 类别拆子目录。已同步更新旧工具的插件引用，旧模块路径不保留兼容转发。

## 登录设置

| 本地接口 | 用途 |
| --- | --- |
| `GET /api/v1/oge/account` | 读取未登录、已登录或过期状态，平台地址、账号、过期时间 |
| `POST /api/v1/oge/account/login` | 接受 `base_url`、`username`、`password`，按文档的 multipart 协议登录 |
| `DELETE /api/v1/oge/account` | 清除本机账号会话；不调用未提供的远端撤销接口 |

API 沿用 Electron 的桌面会话鉴权。页面仅返回账号与有效期，不返回访问令牌或刷新令牌。密码保留原值，仅用于登录请求，不保存、不做 MD5。上游的 OAuth 客户端参数严格采用文档值。

令牌保存在应用数据目录的 `oge/account.json`，目录权限 `0700`、文件权限 `0600`，通过临时文件与原子替换发布；它是私有 JSON 文件，不是加密凭据库，不属于 Agent 的工作区文件挂载。设置读取到损坏文件会明确报错，不重建或换源。新增接入未改数据库结构。

保存访问和刷新令牌的过期时间，但文档没有刷新接口，因此不自动刷新；过期后由用户重新登录。登录失败不替换此前保存的账号；退出后恢复默认平台地址。

## 数据工具

| 名称 | 输入／结果 |
| --- | --- |
| `oge_find_regions` | 地名、可选父级名称、精确／包含匹配、offset 分页；返回 code、level 与完整路径 |
| `oge_search_images` | 时间范围、行政区／闭合多边形／矩形三选一、可选产品 ID 和云量；每页最多 10 景，返回 next_page |
| `oge_get_image_detail` | image_id；返回完整详情，data=null 明确报不存在 |
| `oge_get_image_preview` | image_id；下载 PNG，通过已有附件机制持久保存并返回图片内容 |

行政区树按平台地址缓存一小时；只向 Agent 返回匹配候选，重名不会自动选第一个。各地层级使用平台返回值，县级为 4，不推测代码。坐标使用 WGS84，经纬度边界、闭合多边形、日期和云量均在发出请求前校验。

检索结果包括影像身份、产品、任务、采集时间、云量、分辨率、CRS 与四角坐标。详细元数据按需单独读取；平台内部 `path` 不视为下载地址。业务 JSON 与预览 PNG 有独立字节上限；HTTP 200 的业务错误、JSON 形式的预览失败、网络错误和超时都转换为明确工具错误，并记录日志。

预览复用会话附件、工具来源标记、图像归一化与当前请求模型的图片预算。当前模型未开启图片输入时明确拒绝。预览只是一张非地理参考缩略图，不自动添加到 MapLibre，不代表原始遥感影像或分析产物。

## 核查记录

真实公开接口完成榕江县检索链路：定位 `522632 / level=4`，2025 年 6 月查询返回 224 条记录，读取首景详情并解码 PNG 预览。登录协议、私有存储、密码不落盘、响应不回传令牌和退出清除通过隔离数据目录与模拟上游响应核查；没有使用文档示例中的真实账号。
