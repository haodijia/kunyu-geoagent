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
