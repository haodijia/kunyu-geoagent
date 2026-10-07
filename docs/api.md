# OGE 开发 API

按开发顺序逐项实测、补充。当前仅记录登录接口。

## 1. 登录

### 请求

- 方法：`POST`
- 地址：`http://openge.org.cn/api/oauth/token`
- 鉴权：无需用户 Token
- 请求体：`multipart/form-data`，由客户端生成 boundary

Query 参数（本次成功登录使用的配置）：

| 参数 | 值 | 说明 |
| --- | --- | --- |
| scopes | `web` | 平台登录范围 |
| client_id | `test` | OAuth 客户端 ID |
| client_secret | `123456` | OAuth 客户端密钥 |
| grant_type | `password` | 密码登录 |

表单参数：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| username | string | 是 | 平台账号 |
| password | string | 是 | 明文密码，本次实测不做 MD5 转换 |

### 调用示例

`OGE_USERNAME`、`OGE_PASSWORD` 为本机环境变量，填入有效平台凭据后执行：

```bash
curl --request POST \
  'http://openge.org.cn/api/oauth/token?scopes=web&client_id=test&client_secret=123456&grant_type=password' \
  --form-string "username=${OGE_USERNAME}" \
  --form-string "password=${OGE_PASSWORD}"
```

### 实测记录

日期：2026-10-07；成功登录时间为北京时间 17:10:26。

| 场景 | HTTP 状态 | 业务码 | 结果 |
| --- | --- | --- | --- |
| 上述 Query 配置，表单 username、password 均为空 | `200` | `40000` | `msg="参数为空"`，`data=null` |
| 有效账号、密码，使用上述 Query 和 multipart 表单 | `200` | `20000` | 登录成功，访问令牌和刷新令牌均非空 |

空凭据实际响应：

```json
{
  "code": 40000,
  "msg": "参数为空",
  "data": null
}
```

响应 `Content-Type` 为 `application/json`。HTTP 200 不代表登录成功，开发时必须检查业务码。

### 成功响应

本次实际响应（令牌已脱敏）：

```json
{
  "code": 20000,
  "msg": "",
  "data": {
    "token": "<token>",
    "refreshToken": "<refreshToken>",
    "tokenHead": "Bearer ",
    "expiresIn": 43200,
    "exp": 1791407426,
    "refreshExpiresIn": 2592000,
    "refreshExp": 1793956226
  }
}
```

| 字段 | 类型 | 实测值 / 说明 |
| --- | --- | --- |
| code | integer | `20000` 表示登录成功 |
| msg | string | 空字符串，不以文案判断成功 |
| data.token | string | 用户访问令牌 |
| data.refreshToken | string | 刷新令牌 |
| data.tokenHead | string | `Bearer `，末尾有一个空格 |
| data.expiresIn | integer | `43200` 秒，即 12 小时 |
| data.exp | integer | 访问令牌过期时间，Unix 秒，每次登录动态生成 |
| data.refreshExpiresIn | integer | `2592000` 秒，即 30 天 |
| data.refreshExp | integer | 刷新令牌过期时间，Unix 秒，每次登录动态生成 |

开发时先检查 HTTP 状态和 `code=20000`，再读取 `data.token`。使用返回的 `tokenHead` 与 `token` 拼接鉴权头：

```http
Authorization: Bearer <token>
```

后续业务接口与刷新接口另行实测；本节未验证刷新调用。

本次有效凭据只发送一次登录请求。平台手册注明连续密码错误可能锁定账号，错误密码场景未测试。
