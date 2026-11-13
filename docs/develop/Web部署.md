# Web 部署

## 配置与运行

`web` 分支提供 Vue 浏览器界面，FastAPI 统一提供静态文件、业务 API、OGE 代理和公开 MCP OAuth 回调。容器以 UID/GID `10001:10001` 运行，单一 Web 进程监听 `0.0.0.0:80`。

| 配置 | 说明 |
| --- | --- |
| `KUNYU_PUBLIC_URL` | 浏览器实际访问的完整 URL，包含平台前缀和结尾 `/`；例如 `https://openge.org.cn/app/kunyu/` |
| `KUNYU_ACCESS_PASSWORD` | 至少 12 个字符的共享实例口令，服务启动时校验 |
| `OGE_APP_KEY` | 服务端 OGE AppKey；需要在平台配置公开域名白名单 |
| `KUNYU_APP_DATA_DIR` | 可写业务目录，容器中固定 `/data` |
| `KUNYU_FRONTEND_DIST` | 构建后的前端目录，镜像已设置为 `/app/frontend/dist` |
| `KUNYU_RIPGREP_PATH` | ripgrep 可执行文件的绝对路径，镜像已设置为 `/usr/bin/rg` |
| `PORT` | Web 监听端口，镜像为 `80` |
| `KUNYU_HOST_PORT` | Compose 在宿主机映射的端口，默认 `8080` |

```bash
cp .env.example .env
# 填写公开 URL、实例口令和 AppKey
docker compose up -d --build
docker compose logs -f web
```

页面首次访问输入实例口令，再在「设置 → OGE 平台」登录团队账号。模型、OGE、MCP 和业务数据由整个团队共享。Cookie 为 HttpOnly、SameSite=Lax，作用域限定到应用前缀；公开 URL 为 HTTPS 时设置 Secure。登录有效期为 12 小时，退出或服务重启后重新输入口令。

公开健康检查为 `GET /api/v1/system/health`，只返回状态和 API 版本。业务 API、事件流、附件、成果、瓦片与 OGE 代理均要求实例登录。变更请求的 Origin 必须与公开应用地址一致。

## 平台子路径与反向代理

以 `https://openge.org.cn/app/kunyu/` 为例：

- 设置 `KUNYU_PUBLIC_URL=https://openge.org.cn/app/kunyu/`。
- 静态资源采用相对路径，业务路由使用 `#/...`。
- 浏览器 API、事件流、成果、下载和代理地址统一包含 `/app/kunyu/`。
- 网关可剥离前缀再转发；后端也接受保留此前缀的请求。
- `/app/kunyu` 必须跳转至 `/app/kunyu/`，避免浏览器错误解析相对资源。
- 转发事件流时关闭缓冲，并保留长连接；后端每 15 秒发送保活注释。

Nginx 剥离前缀的示例（`kunyu:80` 替换为实际容器地址）：

```nginx
location = /app/kunyu {
    return 308 /app/kunyu/;
}

location /app/kunyu/ {
    proxy_pass http://kunyu:80/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header Connection "";
    proxy_buffering off;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
    client_max_body_size 70m;
}
```

保留前缀转发时，将 `proxy_pass` 改为 `http://kunyu:80`。根路径部署将公开 URL 设置为域名根地址，并相应调整 location。

OGE 代理只接受 `/openge/api/...`，固定转发 `https://openge.org.cn/api/...`。后端清理逐跳请求头、浏览器 Cookie 和客户端认证头，统一装配团队令牌与 AppKey。缺少配置、平台鉴权失败和上游连接失败均返回明确错误。

## MCP

OAuth 回调地址为：

```text
https://openge.org.cn/app/kunyu/api/v1/mcp/oauth/callback
```

在 MCP 服务的 OAuth 客户端中登记该地址，或确认服务支持动态客户端注册。回调使用一次性 state 校验；应用地址变更后重新授权。浏览器授权页面必须能访问公开回调地址。

stdio MCP 的命令在容器内执行。基础镜像包含 Python、uv、ripgrep；其他可执行程序应写入扩展镜像，工作目录与资料通过显式卷挂载提供，并给予 UID `10001` 所需权限。需要 Node.js 的 MCP 服务应在扩展镜像中安装 Node.js 和确定版本的程序。启动后保存的配置只引用容器内路径。

## 数据、备份与迁移

Compose 使用 `kunyu-data` 命名卷挂载 `/data`，保存数据库、工作区、附件、成果和用户技能。前端设置只展示服务器存储信息；调整目录应停止实例，完成数据复制后修改部署挂载。

升级镜像：

```bash
docker compose down
docker compose up -d --no-build
```

保留 `kunyu-data` 卷。备份前先停止实例，确保没有运行中的 Agent 或文件写入，再备份整个数据卷；恢复时使用完整目录，并保持权限。不要让多个 Web 进程或容器同时读写同一业务目录。

已有 schema 15 桌面数据迁移为 schema 16：

```bash
uv run --project backend python scripts/upgrade_web_storage.py \
  /原业务数据目录 /新的Web业务数据目录
```

源实例必须停止，目标目录必须为空且与源目录互不包含。脚本检查数据库完整性，复制并校验全部业务文件，移除旧 MCP 本机回调端口和 OAuth 注册，保留源目录。MCP OAuth 在新实例中重新授权。迁移失败时保留源数据，检查错误后使用新的空目标目录重新执行。

需要挂载迁移后的宿主机目录时，将 Compose 卷映射改为该目录：

```yaml
volumes:
  - /srv/kunyu/web-data:/data
```

Linux 上先为该目录授予 UID/GID `10001:10001` 读写权限。

## Linux amd64 离线交付

```bash
docker buildx build --platform linux/amd64 --load -t kunyu-web:latest .
docker save -o kunyu-web.tar kunyu-web:latest
```

目标服务器导入并启动：

```bash
docker load -i kunyu-web.tar
cp .env.example .env
# 填写部署配置
docker compose up -d --no-build
```

离线镜像包含应用、Python 依赖和前端资源。模型、OGE、远程 MCP 及公开底图／地形仍需要相应网络访问。基础镜像内不含团队凭据或业务数据。

Compose 的停止宽限为 30 秒。进程收到 SIGTERM/SIGINT 后先停止事件订阅和任务受理，再取消运行、回收子任务与 MCP、释放连接并关闭数据库。

平台托管还需核实 Linux amd64、80 端口、前缀转发、长连接和持久卷支持，登记 AppKey 域名白名单并完成平台审核。
