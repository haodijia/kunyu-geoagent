# 坤舆智枢 · Web

基于 OGE 的灾害遥感监测与研判工作区。Vue 3、TypeScript 和 MapLibre 提供浏览器界面，FastAPI 统一提供业务 API、Agent、OGE 代理和静态资源。

`web` 分支交付网页版本，`main` 保留桌面版本。团队共用一个实例，在设置中登录团队 OGE 账号。

## Docker 启动

交付镜像面向 **Linux amd64**，容器监听 **80** 端口。

```bash
cp .env.example .env
# 编辑 .env，填写实例访问口令、公开地址和 OGE_APP_KEY

docker compose up -d --build
```

默认访问 `http://localhost:8080/`。实例访问口令至少 12 个字符。生产部署将 `KUNYU_PUBLIC_URL` 设置为浏览器实际访问的地址；平台子路径示例：`https://openge.org.cn/app/kunyu/`。

数据保存在 `kunyu-data` 持久卷中，包含数据库、工作区、附件、成果和用户技能。更新镜像后保留该卷即可恢复业务数据。部署、备份、反向代理和公开 OAuth 回调见 [Web 部署](docs/develop/Web部署.md)。

## 离线镜像

```bash
docker buildx build --platform linux/amd64 --load -t kunyu-web:latest .
docker save -o kunyu-web.tar kunyu-web:latest
```

将 `kunyu-web.tar`、`compose.yaml` 和 `.env.example` 复制到目标服务器，填写 `.env` 后启动：

```bash
docker load -i kunyu-web.tar
docker compose up -d --no-build
```

## 本地开发

需要 Node.js 24+、Python 3.12、uv 和 ripgrep。

```bash
npm ci --prefix frontend
uv sync --project backend --frozen
cp .env.example .env
```

本地开发的 `.env` 设置：

```dotenv
KUNYU_PUBLIC_URL=http://localhost:5173/
KUNYU_ACCESS_PASSWORD=请设置至少12个字符的访问口令
OGE_APP_KEY=填写应用AppKey
KUNYU_APP_DATA_DIR=/绝对路径/kunyu-web-data
KUNYU_RIPGREP_PATH=/绝对路径/rg
```

```bash
npm run dev
```

启动器先构建静态入口，再启动 FastAPI（3000）和 Vite（5173）。浏览器访问 `http://localhost:5173/`；终止启动器会一并关闭两个服务。

独立运行后端时，在环境中提供上述配置，并额外设置构建目录和端口：

```bash
npm run build --prefix frontend
export KUNYU_FRONTEND_DIST="$PWD/frontend/dist"
export PORT=8080
uv run --project backend python -m kunyu.main
```

检查命令：

```bash
npm run typecheck --prefix frontend
npm run build --prefix frontend
npm run check:architecture
```

## 桌面数据迁移

Web 使用 schema 16 的单一 SQL 基线。已有 schema 15 数据需要在原实例停止后复制到新的空目录：

```bash
uv run --project backend python scripts/upgrade_web_storage.py \
  /原业务数据目录 /新的Web业务数据目录
```

迁移保留原目录，校验数据库和复制文件；MCP 的桌面 OAuth 注册会清除，进入网页版后重新授权。将新目录挂载至容器 `/data`，并确保 UID/GID `10001:10001` 可读写。详细步骤见部署文档。

## 主要功能

- 工作区与会话：创建、重命名、排序、归档与恢复；文件、成果、记忆及规范管理。
- Agent：流式对话、停止、人工审批、逐题问答、计划模式、进度、子任务及可检查的运行轨迹。
- 模型：多连接、模型发现、能力检查、图片输入、思考参数与上下文压缩；支持原有三种模型 API。
- 地图：MapLibre 二维／三维、影像与成果、波段与视图、点查、区域统计、卷帘与下载。
- OGE：后端统一保存团队凭据并装配 AppKey；数据、算子、计算及成果协议沿用现有业务实现。
- MCP 与技能：远程服务、公开地址 OAuth、服务端 stdio，以及用户技能创建、导入和读取。
- 网页访问：实例口令、HttpOnly 会话 Cookie、同源 API 和 Hash 路由，支持平台子路径。

stdio MCP 的程序和工作目录位于服务器或容器中。基础镜像包含 Python、uv 和 ripgrep；需要 Node.js 或其他程序的 MCP 服务应通过扩展镜像显式安装。

架构说明见 [后端 Agent 结构](docs/develop/后端Agent结构.md)，业务细节见 [Agent 技能](docs/develop/Agent技能.md)、[工具结果契约](docs/develop/工具结果契约.md)、[地图服务](docs/develop/地图服务.md) 和 [OGE 平台接入](docs/develop/OGE平台接入.md)。正赛复演见 [自然语言案例与接口清单](docs/正赛/README.md)。

[Apache License 2.0](LICENSE)
