# 40 · 排错清单

用法：先跑「三条定位命令」，再按症状查表。每条都是 **症状 → 原因 → 处理**，
命令块标了目标环境（服务器 / 容器 / 本机 / 小程序）。

约定：`<域名>` 换成你的域名；Track B 的安装目录是 `/class`（安装时可能改过），
Track A 的容器工作目录是 `/app`。**改完任何环境变量都要重启进程**：
Track B 是 `pm2 restart think-class --update-env`，Track A 是重新发布版本。

---

## 0. 三条定位命令

```bash
# 1) 后端本机是否健康（绕开 Nginx / 平台入口）
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3001/api/health
#    期望 200。不是 200 → 应用本身的问题，先看 pm2 logs / 容器日志

# 2) 从公网入口是否健康（含 Nginx / 平台 / 证书）
curl -s -o /dev/null -w '%{http_code}\n' https://<域名>/api/health
#    期望 200。1) 通而 2) 不通 → Nginx、证书、安全组、平台配置的问题

# 3) 证书链与 TLS 版本（真机失败、工具正常时必看）
openssl s_client -connect <域名>:443 -servername <域名> </dev/null 2>/dev/null \
  | grep -E 'Verify return code|Protocol|Cipher'
#    期望：Verify return code: 0 (ok)；Protocol 为 TLSv1.2 / TLSv1.3
```

Track A（云托管）没有自己的域名，第 2、3 条换成控制台给的 HTTPS 测试域名；
小程序侧始终用真机验证一次 `wx.cloud.callContainer`。

---

## 0.1 云托管开不了：`-601009 该小程序没有绑定手机号`

**症状**：在云托管点「自定义部署 / 创建环境」时直接报：

```text
Error: Base resp abnormal, {"ret":-601009,"errmsg":"该小程序没有绑定手机号，请联系小程序管理员前往MP绑定手机号","wx_req_id":"..."}
```

**原因**：不是云托管的问题，也不是认证或费用问题 —— 是这个**小程序账号本身缺手机号**。早期注册的、
或通过第三方「快速创建」出来的小程序常见这一项缺失，而微信在开通云托管/云开发时会校验它。

**处理**（管理员本人操作，约 2 分钟）：

1. 用**管理员微信**扫码登录 <https://mp.weixin.qq.com/>（就是注册这个小程序的那个微信，别人不行）；
2. 左侧 **成员管理**（旧版界面叫「成员设置」，可能在「设置」或「管理」分组下）；
3. 找到**管理员**那一行 → 点 **修改**；
4. 弹窗里填**手机号** → 收短信验证码 → 管理员微信扫码确认 → 保存；
5. 回到云托管重走一遍：自定义部署 → 环境名称（如 `prod`）→ 网络类型「系统创建」→ 勾选服务条款 → 确定。

找不到「修改 / 手机号」入口时，按顺序试：

1. 「设置 → 基本设置 → 账号信息」，有些账号的手机号补填在这里；
2. 界面版本不同时该入口在「管理 → 成员管理」；
3. 仍找不到就在公众平台右下角「客服」或微信开放社区发帖，附错误码 `-601009` 与 `wx_req_id`。
   社区里已有同错的帖子，官方回复就是上面这条路径（「成员设置-管理员修改-手机号填写」）。

> 补填手机号**不需要**微信认证、不改变个人主体身份、也不产生费用。它只是把账号资料补齐。

---

## 1. 域名未备案

| | |
| --- | --- |
| **症状** | 开发者工具关掉「不校验合法域名」后请求失败；真机报 `request:fail url not in domain list` 或直接超时；`curl https://<域名>/api/health` 在电脑上是通的 |
| **原因** | 「服务器域名」白名单只接受**已 ICP 备案**的域名（境内主体）。未备案域名无法加入白名单；即使强行加入也会被拦截 |

**处理**

1. 查备案状态：到域名服务商/工信部备案系统查询该域名与主体。备案未完成时**没有任何小程序侧的绕法**。
2. 时间不够就走 Track A（云托管不需要域名与备案）：见 [10-deploy-cloudrun.md](10-deploy-cloudrun.md)。
3. 备案完成后回到公众平台重新提交「服务器域名」，等生效（以后台提示为准）。

```bash
dig +short <域名>            # 先确认解析本身没问题
curl -sI https://<域名>/api/health | head -n 1
```

---

## 2. 证书链不完整

| | |
| --- | --- |
| **症状** | 开发者工具正常，**iOS/Android 真机**请求失败；或部分网络（4G）失败、Wi-Fi 正常；`curl` 在电脑上正常 |
| **原因** | Nginx 用了 `cert.pem`（不含中间证书）而不是 `fullchain.pem`。桌面浏览器/`curl` 常常会自动补链，小程序真机不会 |

**处理**

```bash
# 数证书条数：只有 1 条就是链不完整（正常是 2 条以上：站点证书 + 中间证书）
openssl s_client -connect <域名>:443 -servername <域名> -showcerts </dev/null 2>/dev/null \
  | grep -c 'BEGIN CERTIFICATE'

# 看 Nginx 用的是哪个文件
sudo grep -n 'ssl_certificate' /etc/nginx/conf.d/think-class.conf
#   必须是 ssl_certificate /etc/letsencrypt/live/<域名>/fullchain.pem;
#   不是 .../cert.pem

sudo nginx -t && sudo systemctl reload nginx
```

模板里已经是 `fullchain.pem`：见 [`deploy/nginx/think-class-https.conf`](../../deploy/nginx/think-class-https.conf)。

---

## 3. TLS 版本低于 1.2

| | |
| --- | --- |
| **症状** | 真机握手失败，报网络错误；`openssl` 显示 `Protocol: TLSv1` 或 `TLSv1.1` |
| **原因** | 小程序要求 TLS 1.2 及以上。老发行版 Nginx 的默认 `ssl_protocols` 可能仍开着 TLS 1.0/1.1 |

**处理**

```bash
# 看当前协商到的版本
openssl s_client -connect <域名>:443 -servername <域名> </dev/null 2>/dev/null | grep Protocol

# 明确试 TLS 1.1：应当握手失败（说明已经不支持），成功才说明配置有问题
openssl s_client -connect <域名>:443 -servername <域名> -tls1_1 </dev/null 2>&1 | head -n 3

# 确认配置里有这一行（模板已包含）
grep -n 'ssl_protocols' /etc/nginx/conf.d/think-class.conf
sudo nginx -t && sudo systemctl reload nginx
```

---

## 4. 端口与配置不一致

| | |
| --- | --- |
| **症状** | `http://<域名>` 打不开或 502；`curl http://127.0.0.1:3001/api/health` 也不通；PM2 显示进程在跑 |
| **原因** | 安装时端口被占用，`install.sh` **自动换过端口**（`AUTO_PICK_PORT` 默认 y），而 Nginx 模板里仍是 `3001`；或者安全组没放行 80/443 |

**处理**

```bash
# 应用实际监听在哪个端口（以 .env 为准）
grep '^PORT=' /class/.env
ss -lntp | grep -E ':(80|443|3001|30[0-9][0-9])'

# Nginx 反代指向哪个端口
grep -n 'proxy_pass' /etc/nginx/conf.d/think-class.conf
#   两者不一致就改 proxy_pass 指向 .env 里的端口，再 reload
sudo nginx -t && sudo systemctl reload nginx

# 安全组/防火墙：80 与 443 必须放行（云控制台的安全组与机器上的防火墙是两处）
sudo ufw status | grep -E '80|443'
```

对应的 502 日志：`sudo tail -50 /var/log/nginx/error.log`（`connect() failed (111: Connection refused)` 就是端口不对）。

---

## 5. 「打开调试能请求，关闭就失败」

| | |
| --- | --- |
| **症状** | 开发者工具勾了「不校验合法域名…」时一切正常；取消勾选或换真机就失败 |
| **原因** | 那个勾**只对开发者工具有效**，它同时跳过域名白名单、HTTPS 强制与证书校验。关掉之后，微信按真实规则校验：域名必须在白名单里、必须 HTTPS、证书链必须完整 |

**处理**

1. 关闭该勾选，在工具里复现一次 —— 报错信息会直接告诉你缺哪一项（域名未配置 / 证书 / TLS）。
   注意 `miniprogram/project.config.json` 里写着 `"urlCheck": false`，它和这个勾是同一件事，
   同样是**只对开发者工具有效**，所以别把"工具里能跑"当成已验证。
2. 按 [30 文档第 1.1 节](30-release-miniprogram.md#11-服务器域名只有-track-b-需要) 补 `request` 域名
   （如果小程序里有 `wx.uploadFile`，`uploadFile` 域名的规则相同）。
3. 真机再验证一次：工具与真机的网络栈不同，"工具通了"不代表真机通了。
4. Track A 用 `callContainer` 时本项不适用（不走域名白名单）；若仍失败，检查
   [`miniprogram/config/index.ts`](../../miniprogram/config/index.ts) 的 `CLOUD_ENV` / `CLOUD_SERVICE` 是否填了，
   以及基础库是否支持 `callContainer`（客户端会直接报「当前微信基础库不支持云托管调用」）。

---

## 6. `wx.request` 并发上限 10

| | |
| --- | --- |
| **症状** | 首页/仪表盘一次拉多个接口时，个别请求失败或一直 pending；单独调用同一个接口却正常 |
| **原因** | 小程序对同一时刻的 `wx.request` 并发有上限（**10 个**），超出的请求会排队甚至失败。后端与网络都没问题 |

**处理（在小程序侧，不在服务端）**

- 首屏把多个接口合并成一次请求，或改成串行（`await` 链式）；
- 列表用分页/懒加载，不要一次并发拉多个班级 × 多个学生；
- 排查时在后端日志里数同一时刻到达的请求，确认是不是并发触顶：

```bash
pm2 logs think-class --lines 300 | grep -c 'GET /api'
```

> 后端侧能做的只有减少接口数量（合并接口），这属于产品改动；并发上限是客户端行为。

---

## 7. 请求域名不能是 IP 或 localhost

| | |
| --- | --- |
| **症状** | 想用 `http://1.2.3.4:3001`、`http://localhost:3001` 或 `https://<域名>:3001` 作为请求地址，白名单保存不了或请求被拒 |
| **原因** | 服务器域名只能是**域名**：不能是 IP、不能是 localhost、不能带端口、必须 HTTPS |

**处理**

- 用域名（Track B，需备案）：`https://<域名>`；
- 或者用 `wx.cloud.callContainer`（Track A，完全不需要域名）：见 [10 文档第 8 节](10-deploy-cloudrun.md#8-小程序侧wxcloudcallcontainer无需配置通讯域名)；
- 本地联调不要改小程序去指本机，而是把开发者工具的「不校验合法域名」勾上（仅本地）。

---

## 8. 不能把 `api.weixin.qq.com` 配成服务器域名 / AppSecret 必须留在服务端

| | |
| --- | --- |
| **症状** | 想让小程序直接调 `https://api.weixin.qq.com/sns/jscode2session`，报 `url not in domain list`；或者把 `WECHAT_SECRET` 写进了小程序代码 |
| **原因** | 微信接口域名不能加入小程序的服务器域名白名单；而且小程序代码包是可被反编译的，AppSecret 一旦进去就等于公开 —— 任何人都能用它冒充你的小程序调微信接口 |

**处理**

- `code2session` 放在服务端：小程序 `wx.login()` 拿 code → 调后端 `POST /api/wechat/login` → 后端用 `WECHAT_APPID` / `WECHAT_SECRET` 换 session（[`plugins/wechat/src/wechat.gateway.ts`](../../plugins/wechat/src/wechat.gateway.ts)）。
- 如果已经泄露过 AppSecret：到公众平台**重置**它，再更新服务端环境变量并重启。

```bash
# Track B：确认服务端已经配上（`.env` 里的值，不要 echo 出来）
grep -c '^WECHAT_APPID=' /class/.env
grep -c '^WECHAT_SECRET=' /class/.env

# 未配置时 /api/wechat/login 应当返回 503（这是刻意的：没有默认值）
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://<域名>/api/wechat/login \
  -H 'content-type: application/json' -d '{"code":"probe"}'
#   503 = 变量没配上；401（微信登录凭证无效）之类 = 已配置、只是 code 无效（正常）
```

Track A 在云托管控制台的环境变量里配同样的两个名字，然后重新发布。

### 8.1 开发登录开关没收住

| | |
| --- | --- |
| **症状** | 有人不用微信也能登录小程序（请求体里带 `devOpenid` 即可） |
| **原因** | 后端有两道闸：`NODE_ENV=production` 时直接 403；否则还需要 `WECHAT_ALLOW_DEV_LOGIN=1`。而 `install.sh` / `update.sh` **都不设 `NODE_ENV`**，所以第一道闸默认是开着的 |

```bash
grep -E '^(NODE_ENV|WECHAT_ALLOW_DEV_LOGIN)=' /class/.env   # 前者应为 production，后者不应存在
grep -i 'wechat dev login used' /class/logs/*.log 2>/dev/null   # 每次使用都会记一条日志
pm2 logs think-class --lines 200 | grep -i 'wechat dev login'
```

处理：设 `NODE_ENV=production`、删掉 `WECHAT_ALLOW_DEV_LOGIN`，然后 `pm2 restart think-class --update-env`。
本地联调可以用，但**不要**在用于提报的那套环境上留这个开关。

---

## 9. 401 / 会话过期

| | |
| --- | --- |
| **症状** | 小程序里某些接口返回 401 或"未登录"；重新登录后又好了；或者**服务刚重启，所有人的 token 同时失效** |
| **原因** | 会话有有效期（`SESSION_TTL_MS`，默认 7 天）；会话存在数据库的 `sessions` 表里，所以**如果数据库不是持久化的**（容器没挂 CFS / 数据库被换过），重启就等于所有人被登出 |

**处理**

```bash
# 验证当前 token 是否有效（token 来自 /api/auth/login 的返回）
curl -s -o /dev/null -w '%{http_code}\n' https://<域名>/api/kernel/auth/me \
  -H 'Authorization: Bearer <token>'
#   200 = 有效；401 = 已过期/被登出/签名不匹配

# 会话表在不在、有多少条
cd /class && node -e "const D=require('better-sqlite3');const db=new D('database.sqlite',{readonly:true});console.log(db.prepare('select count(*) c from sessions').get());"
```

- 正常过期：小程序自己会恢复 —— [`miniprogram/utils/request.ts`](../../miniprogram/utils/request.ts) 遇到 401 会跑
  `wx.login` → `POST /api/wechat/login` 静默重登并重试原请求（同一个 burst 内只跑一次），
  只有拿不到 token（返回 `bound: false`，即这个微信已经不再绑定任何账号）时才清会话并回登录页。
  所以小程序里出现大面积 401 弹回登录页，通常意味着**绑定关系没了**或**服务端会话表丢了**，而不是"用户太久没登录"。
- **重启后集体失效**：说明数据库没在持久存储上（Track A 必查 CFS 挂载；见 [10 文档第 6 节](10-deploy-cloudrun.md#6-数据持久化验证上线前必须做)）。
- 想延长有效期就设 `SESSION_TTL_MS`（毫秒），重启生效。

---

## 10. 容器冷启动

| | |
| --- | --- |
| **症状** | 一段时间没人用之后，第一个请求明显变慢甚至超时；之后又正常 |
| **原因** | 最小副本为 0 时平台会把实例缩到零，下次请求要冷启动（拉镜像、起进程、跑迁移）。首次启动还要建表，比之后的启动慢 |

**处理**

- 把**最小副本数设为 1**（Track A 本来就必须是 1，见下方第 11 条）；
- 健康检查指向 `/api/health`，让平台在实例真正可用之后才接流量；
- 后端侧不要加"启动即预热"之类的东西 —— 冷启动是平台行为，减小它的唯一办法是别缩到 0。

Track B 没有冷启动问题，但 `pm2 startup` + `pm2 save` 没配好的话，**服务器重启后应用不会自己起来**，
表现和冷启动很像：

```bash
pm2 list                     # 看 think-class 是否 online
pm2 startup systemd          # 按输出提示执行一次
pm2 save
```

---

## 11. SQLite 被多实例打开

| | |
| --- | --- |
| **症状** | 日志出现 `SQLITE_BUSY` / `database is locked`；写入偶发丢失；数据像是"回滚"到几分钟前 |
| **原因** | SQLite 只允许一个写者。多副本、多 PM2 进程、或把数据库放在网络文件系统上，都会撞锁；WAL 模式还依赖共享内存，在网络挂载上更不安全 |

**处理**

```bash
# Track B：确认只有一个进程在跑，且没有重复的 PM2 应用名
pm2 list
pm2 delete <多余的应用名>

# 数据库文件与边车文件（-wal / -shm 只应在 journal_mode=wal 时出现）
ls -l /class/database.sqlite*

# 确认 journal 模式：CFS / 网络挂载上必须是 delete
cd /class && node -e "const D=require('better-sqlite3');const db=new D('database.sqlite',{readonly:true});console.log(db.pragma('journal_mode'));"
```

- Track A：最小副本数 = 最大副本数 = **1**，并设 `DATABASE_SKIP_WAL=1`（本分支新增）。
- Track B：只跑一个 PM2 进程；数据库必须放在**本机磁盘**上，不要放 NFS/SMB/网盘同步目录。
- 如果 `journal_mode` 仍是 `wal` 而你正把库放在网络存储上：立即改走本机磁盘，或等 `DATABASE_SKIP_WAL` 在你的构建里生效（[10 文档第 7 节](10-deploy-cloudrun.md#7-失败回退挂不上持久化存储就立刻改走-track-b)）。

---

## 12. 时区与 UTF-8

| | |
| --- | --- |
| **症状 A** | 页面时间比北京时间少 8 小时（或作业截止时间判断看起来不对） |
| **原因 A** | 容器/服务器默认时区是 UTC，Node 按 `TZ` 解析本地时间 |

```bash
# 临时确认
date; node -e "console.log(new Date().toString())"
# 修复：在 .env 里加 TZ=Asia/Shanghai，然后
pm2 restart think-class --update-env
# Track A：在云托管环境变量里设 TZ=Asia/Shanghai，重新发布
```

| | |
| --- | --- |
| **症状 B** | 学生姓名或中文内容显示为 `????` / 乱码 |
| **原因 B** | 绝大多数情况不是数据库编码问题（SQLite 一律以 UTF-8 存储），而是①导入的文件本身不是 UTF-8（Excel/CSV 导出常见 GBK）②`ENCRYPTION_KEY` 不匹配（见第 13 条） |

```bash
# 服务器 locale 与终端编码
locale
# 期望包含 UTF-8，例如 LANG=C.UTF-8 或 zh_CN.UTF-8

# 看数据库里存的原样内容（密文会显示成 hex:hex 形式）
cd /class && node -e "const D=require('better-sqlite3');const db=new D('database.sqlite',{readonly:true});console.log(db.prepare('select id,name from students limit 5').all());"
```

---

## 13. `ENCRYPTION_KEY` 不匹配 → 学生姓名不可读

| | |
| --- | --- |
| **症状** | 学生姓名显示为 `32位十六进制:十六进制` 这样的字符串，或乱码；新建的学生姓名也可能同样不可读 |
| **原因** | 学生姓名用 `ENCRYPTION_KEY` 做了 AES 加密（[`api/db.ts`](../../api/db.ts)）。解密失败时 `decrypt()` 会**把密文原样返回**，所以页面显示的是密文。常见起因：换了 `.env`、从别处拷了数据库、回滚时把 `.env` 换成了另一把密钥、或为部署新生成了一把密钥 |
| **严重性** | **换错密钥是不可逆的**：没有旧密钥就无法恢复这些姓名。这是最该提前备份 `.env` 的原因 |

**处理**

```bash
# 1) 当前密钥长度必须是 32 字节（hex 形式就是 32 个字符）
grep '^ENCRYPTION_KEY=' /class/.env | cut -d= -f2- | tr -d '"' | wc -c    # 期望 33

# 2) 确认库里存的是密文（hex:hex）
cd /class && node -e "const D=require('better-sqlite3');const db=new D('database.sqlite',{readonly:true});console.log(db.prepare('select id,name from students limit 3').all());"

# 3) 找回旧密钥：备份的 .env、/class/backups/ 里的归档、或者你的密码管理器
ls -l /class/backups/ | tail -n 5
tar -xzOf /class/backups/backup_<时间戳>.tar.gz ./.env | grep '^ENCRYPTION_KEY='
```

- 找回了旧密钥：把 `.env` 换回旧值，`pm2 restart think-class --update-env`。
- 确实要换密钥：**先用旧密钥重加密，再换**（顺序反了就读不出来了）：

```bash
node scripts/rotate-encryption-key.mjs \
  --db /class/database.sqlite \
  --old-key '<旧密钥>' \
  --new-key '<新密钥（32 字节）>' \
  --dry-run          # 先看报告，确认无误后去掉 --dry-run 并加 --yes
```

- 旧密钥彻底丢失：这些姓名**无法恢复**（如实记录，不要试图用新密钥读）。可以让学生重新录入，
  或从更早的、仍用旧密钥加密的数据库备份里恢复。

---

## 14. 上传体积（413 / 照片传不上去）

| | |
| --- | --- |
| **症状 A** | 拍照上传返回 413，或者卡在上传；**应用日志里没有任何记录** |
| **原因 A** | Nginx 的 `client_max_body_size` 默认只有 **1MB**。`install.sh` 生成的配置没有这一行，所以稍大的手机照片会被 Nginx 直接拒绝，请求根本没到应用 |

```bash
# 看当前配置里有没有这一行
sudo grep -rn 'client_max_body_size' /etc/nginx/ 2>/dev/null

# 修：用 443 模板替换（内含 client_max_body_size 12m），或手工加进 location/server 块
cd /class && sudo sed 's/<DOMAIN>/<你的域名>/g' deploy/nginx/think-class-https.conf \
  | sudo tee /etc/nginx/conf.d/think-class.conf > /dev/null
sudo nginx -t && sudo systemctl reload nginx

# 对应的错误日志长这样：
sudo grep -n 'client intended to send too large body' /var/log/nginx/error.log
```

| | |
| --- | --- |
| **症状 B** | 请求到了应用，返回 400，消息是「照片不能超过 10MB」 |
| **原因 B** | 应用侧上限就是 10MB（`MAX_PHOTO_BYTES`），且只接受 jpeg/png/webp/heic/heif。这是刻意设的上限，不是配置错误 |

处理：压缩后再传 —— Web 端在 canvas 里压，小程序端用 `wx.chooseMedia` 的 `sizeType: ['compressed']`；
或提示用户换一张。**注意**：当前小程序客户端里没有照片上传代码
（[`miniprogram/services/homework.ts`](../../miniprogram/services/homework.ts) 只有读取/作答/保存/提交），
拍照上传是 Web 端的流程；在小程序里补上传时才需要关心这一段，且要同时补 `uploadFile` 合法域名。
不要把 Nginx 的 `client_max_body_size` 调到很大来"解决"——真正拒绝 10MB 以上文件的是应用，
调 Nginx 只会让更大的无效请求打到后端。

```bash
# 确认应用收到的是什么（Track B）
pm2 logs think-class --lines 100 | grep -i 'photo\|upload\|413\|10MB'
```

---

## 15. 启动就退出：插件 0 个 / 缺超管 / 没有前端

这三类都是"进程直接起不来"，日志里有明确原因，别猜。

| | |
| --- | --- |
| **症状 A** | 日志：`The plugin host is enabled but activated 0 plugins...`，进程退出 |
| **原因 A** | 镜像/目录里缺 `plugins/*/plugin.json`，或 `THINK_CLASS_ROOT` 指向了别处，或误设了 `PLUGINS_ENABLED=0`。所有业务域都是插件，宿主启用却激活 0 个插件时 [`api/app.ts`](../../api/app.ts) 会 fail-closed 拒绝启动 |

```bash
# Track B
ls /class/plugins/*/plugin.json | wc -l      # 应与 plugins/ 下的插件目录数一致，且不为 0
grep -E '^(PLUGINS_ENABLED|THINK_CLASS_ROOT|PLUGIN_DIRS)=' /class/.env
# Track A：容器内
ls /app/plugins/*/plugin.json | wc -l
```

| | |
| --- | --- |
| **症状 B** | 日志：`Refusing to create the first superadmin without a credential: set SUPERADMIN_USERNAME ...` |
| **原因 B** | 数据库里还没有 superadmin 行，而环境变量没配（没有默认账号，拒绝启动） |

处理：设置 `SUPERADMIN_USERNAME` 与 `SUPERADMIN_PASSWORD` 后重启。
数据库里**已有** superadmin 行时，只要这两个变量都设置，每次启动都会覆盖账号与密码 —— 这也是改密码的方式。

| | |
| --- | --- |
| **症状 C** | `/api/health` 正常，但打开站点首页是 404 / 空白 |
| **原因 C** | 没有构建出 `dist/`。服务端从 `../dist` 提供前端（[`api/app.ts`](../../api/app.ts)），容器镜像里由 `npm run build` 生成 |

```bash
ls -l /class/dist/index.html        # Track B；缺失就 cd /class && npm run build
ls -l /app/dist/index.html          # Track A；缺失说明镜像构建跳过了 npm run build
```

---

## 16. 一键更新失败 / 回滚了

| | |
| --- | --- |
| **症状** | 后台点更新后服务没变化；或更新到一半回滚了；页面一直显示"更新中" |
| **原因** | `update.sh` 是 fail-closed 的：PM2 服务不存在、Node < 24、Release 缺 `SHA256SUMS`、校验不匹配，任一条件不满足都会中止（必要时自动回滚）。它还需要能访问 GitHub |

```bash
# 状态与日志（后台页面读的就是这两个文件）
cat /class/logs/update-status.json
tail -n 100 /class/logs/update.log

# 是否有正在跑的更新进程
pgrep -af update.sh

# 版本状态
grep '^CURRENT_VERSION=' /class/.env

# 手工重试（前台执行，能看到完整输出）
cd /class && sudo bash update.sh
```

- 状态卡在 `running` 但进程已经没了：状态文件里记着 `pid`，进程不存在时后台会把它判为失败，
  重新点一次即可；也可以直接改 `logs/update-status.json` 的 `state`（它只是状态展示）。
- 校验失败（`SHA256SUMS` 缺失或 sha256 不匹配）：**不要**绕过校验去解包，
  先确认网络/代理是否改写了下载内容；这是防"下到半个包"的机制。
- 后台一键更新**仅 Linux**：非 Linux 平台会返回 400，Windows 服务器用 [`update.ps1`](../../update.ps1)。
