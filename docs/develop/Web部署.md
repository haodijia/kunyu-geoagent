# Web 部署

`web` 是独立的 Vue 网页交付分支；桌面版本保留在 `main`。

## 服务配置

`KUNYU_PUBLIC_URL` 是浏览器访问的完整应用地址，包含平台子路径，例如 `https://openge.org.cn/app/kunyu/`。网关必须剥离该前缀后转发容器；容器也接受包含该前缀的请求。Cookie、OGE 代理和 MCP OAuth 回调使用同一地址。本地开发使用 `http://localhost:5173/`，通过 Vite 转发业务接口。

`KUNYU_ACCESS_PASSWORD` 是至少 12 个字符的共享实例访问口令。登录会话有效期为 12 小时，退出及服务重启使对应会话失效。业务数据、模型配置及 OGE 身份由团队共享。

`KUNYU_APP_DATA_DIR` 必须指向可写业务目录；容器使用 `/data`，挂载持久卷。`KUNYU_FRONTEND_DIST` 指向构建后的前端目录。`PORT` 默认 80。`OGE_APP_KEY` 仅在服务端配置，OGE Token 继续由设置中的团队账号登录取得。

FastAPI 同时提供静态文件、业务 API、OGE 固定目标代理及 MCP OAuth 回调；生产环境仅启动一个 Web worker。stdio MCP 在服务器或容器中运行，命令及工作目录必须在该环境中存在。
