# 20 · Track B：自有服务器部署（install.sh + Nginx + HTTPS）

**这条路解决的问题**：你已经有服务器，也有一个**已备案**的域名，想让小程序用 `wx.request`
直接打自己的后端。

它比 Track A 多三件事，少一件事：

- 多：域名备案、DNS 解析、TLS 证书（仓库里**没有任何 TLS 配置**，HTTPS 只能自己加）。
- 少：不需要云托管的 CFS/单副本约束，数据就在本机磁盘上。

动手前请确认域名**已经备案完成**（备案以各省管局审核为准，时间不可控）。
没有备案域名 → 走 [Track A](10-deploy-cloudrun.md)。两条路的对比见 [README 决策表](README.md#决策表track-a云托管-vs-track-b自有服务器)。

---

## 1. 服务器要求

| 项 | 要求 | 说明 |
| --- | --- | --- |
| 系统 | Ubuntu / Debian / CentOS / RHEL / AlmaLinux / Rocky / Fedora | `install.sh` 读 `/etc/os-release` 的 `ID` 判断，其它发行版会直接拒绝 |
| 权限 | **root**（或 `sudo`） | 脚本开头就 `require_root` |
| 磁盘 | 根分区可用空间 **≥ 1GB** | 预检项，低于这个值直接退出；实际还要留给数据库、上传照片、`backups/` |
| Node.js | **≥ 24** | `package.json` 的 `engines`；脚本会用 NodeSource 自动装 v24（apt/dnf/yum） |
| PM2 | 没装的话脚本会 `npm install -g pm2` | 进程名固定为 `think-class` |
| 网络 | 能访问 GitHub（下载 Release） | 国内网络不稳时见 README 里给出的 ghproxy 镜像写法 |
| 端口 | 3001（应用，默认）、80（Nginx） | 80 被占用时脚本会要求你先停掉占用进程 |
| 域名 | 一个**已备案**的域名，A 记录可指向本机公网 IP | 小程序「服务器域名」只能填域名，不能填 IP、不能带端口、不能是 localhost |

> 已有 Nginx、面板（宝塔等）或别的站点时：脚本会写
> `/etc/nginx/conf.d/think-class.conf`（有 `sites-available/` 时写那里并软链），
> 不要让它覆盖你现有的 server 块。要人工接管就选「不配置 Nginx」，自己抄第 4 节的模板。

---

## 2. `bash install.sh` 做了什么（按执行顺序）

```bash
# Linux（Ubuntu/Debian/CentOS 系）。需要 root：脚本第一步就是 require_root，
# 所以要么在 root shell 里执行，要么在命令前加 sudo。
wget -O install.sh https://raw.githubusercontent.com/xhnhhnh/Think-Claass/main/install.sh && bash install.sh

# 国内网络拉 GitHub 不稳时，用 README 给的镜像前缀：
# wget -O install.sh https://ghproxy.net/https://raw.githubusercontent.com/xhnhhnh/Think-Claass/main/install.sh && bash install.sh
```

> 上面是 README 的官方写法（从 `main` 分支取安装器）。想装**本分支**的代码，
> 见第 8 节的说明 —— 安装器装的是最新 Release，不是当前分支。

脚本会逐条问你，然后按下表的顺序执行（每个函数名都能在 [`install.sh`](../../install.sh) 里找到）：

| 步骤 | 函数 | 做什么 / 你要注意什么 |
| --- | --- | --- |
| 1 | `preflight` | 检查 root、系统类型、根分区可用空间 ≥1GB |
| 2 | `collect_inputs` | 依次问：**域名或 IP**、安装目录（默认 `/class`）、**超管后台路径**（默认 `/beiadmin`）、**超管账号**、**超管密码**、端口（默认 `3001`）、端口被占用时是否自动换端口、是否自动杀掉占用端口的进程、是否自动安装配置 Nginx、配置前是否先停 Nginx。超管账号与密码**必填**，安装器不再提供默认账号 |
| 3 | `ensure_commands` | 缺 `curl unzip jq` 就用系统包管理器装上 |
| 4 | `check_ports` | 端口占用处理：默认会自动换到可用端口（**换了要记住新端口**，后面 Nginx/防火墙都要用它）；配 Nginx 时 80 端口必须空闲 |
| 5 | `prepare_directory` | `mkdir -p /class`，把属主改成调用 sudo 的那个用户，然后 `cd` 进去 |
| 6 | `download_latest_release` | 取 GitHub 最新 Release → 下载 `think-class-release.zip` → **校验 `SHA256SUMS`**（缺失或不匹配直接中止，这是 fail-closed 的）→ 解包到安装目录 |
| 7 | `ensure_build_tools` | 缺 `make` / `g++` / `python3` 就装（`better-sqlite3` 是原生模块） |
| 8 | `ensure_node` | 检查 Node 主版本 ≥ 24，不满足就用 NodeSource 脚本升级 |
| 9 | `ensure_pm2` | 没有 PM2 就全局安装 |
| 10 | `write_env` | 写 `.env`：`SUPERADMIN_*`、`VITE_ADMIN_PATH`、`CURRENT_VERSION`、`PORT`、`ENCRYPTION_KEY`、`DATABASE_URL`。**`ENCRYPTION_KEY` 已存在就沿用**，不存在才生成（重新安装不会换密钥）；不再写已废弃的 `VITE_API_URL` |
| 11 | `build_project` | `npm install` + `npx prisma generate --schema prisma/schema.prisma`。从 Release 包安装时不再 `npm run build`（`dist/` 已经在包里） |
| 12 | `setup_pm2_startup` | `pm2 start npm --name think-class -- run start`（已存在则 `pm2 restart --update-env`）→ `pm2 save` → `pm2 startup systemd` |
| 13 | `setup_nginx` | 写 HTTP/80 的反代配置，`nginx -t` 后重启 Nginx。**这一步只配 80，没有 HTTPS，也没有 `client_max_body_size`** |
| 14 | `print_success` | 打印访问地址、后台地址、安装目录、PM2 服务名、超管账号与密码 |

安装完成后，应用与数据的位置：

```text
/class/.env                 配置（含 ENCRYPTION_KEY 与超管密码 —— 最该备份的文件）
/class/database.sqlite      SQLite 数据库
/class/uploads/             上传的作业照片与试卷
/class/logs/                更新日志（update.log / update-status.json）
/class/backups/             update.sh 每次更新前的自动备份
```

---

## 3. 装完立刻做三件事

### 3.1 手工确认 `ENCRYPTION_KEY`，并备份 `.env`

```bash
cd /class
grep '^ENCRYPTION_KEY=' .env | cut -d= -f2- | tr -d '"' | wc -c   # 期望 33（32 个字符 + 换行）
chmod 600 .env
cp .env /root/think-class-env-backup-$(date +%F).txt              # 备份到仓库/安装目录之外
```

为什么要这样强调：学生姓名是**加密存储**的，密钥没有默认值（guardrail G18）。
`ENCRYPTION_KEY` 丢失或与写入时不一致时，解密失败会把密文原样返回，
页面上出现 `iv:cipherhex` 形式的乱码 —— 那是**不可恢复**的（除非你还留着旧密钥）。
`update.sh` 与 `update.ps1` 都不会重新生成密钥，只有"真的缺失"时才补一把并明确警告。

### 3.2 补上生产模式（可选但建议）

`install.sh` **不设置 `NODE_ENV`**，所以 PM2 起的进程是 development 模式。想改成生产模式：

```bash
cd /class
grep -q '^NODE_ENV=' .env || echo 'NODE_ENV=production' >> .env
pm2 restart think-class --update-env
```

（`.env` 由 [`api/app.ts`](../../api/app.ts) 里的 `dotenv.config()` 读取，但 dotenv **不覆盖**进程里已有的变量，
所以改完必须 `--update-env` 让 PM2 重新读环境。）

> 这一条不只是日志级别：`plugins/wechat` 拒用开发登录（`devOpenid`）的第一道闸就是
> `ctx.config.env === 'production'`，而这个值来自 `NODE_ENV`。
> 不设 `NODE_ENV` 时，只要有人加上 `WECHAT_ALLOW_DEV_LOGIN=1`，就能不用微信直接登录。

### 3.3 确认服务在跑

```bash
pm2 list
pm2 logs think-class --lines 100
curl -s http://127.0.0.1:3001/api/health      # 端口以 .env 里的 PORT 为准
```

`/api/health` 返回 `{"success":true,...}` 且 `kernel.plugins.total` 不为 0 才算正常。

### 3.4 小程序侧指向这台服务器

模板里 HTTPS 生效之后，把小程序的后端地址改成你的域名 —— 这是 [`miniprogram/config/index.ts`](../../miniprogram/config/index.ts) 里的一行：

```ts
export const BASE_URL = 'https://<你的域名>'
export const TRANSPORT: 'request' | 'container' = 'request'
```

同时确认 `MOCK.enabled` 是 `false`（它是给没有后端时的 UI 评审用的）。
详细说明与其余要改的配置见 [30 文档第 0 节](30-release-miniprogram.md#0-小程序侧要先改的四处配置)。

---

## 4. 域名解析 + 证书 + 443

### 4.1 DNS

在域名服务商处加一条 A 记录：`<你的域名>` → 服务器公网 IP。等解析生效：

```bash
dig +short <你的域名>        # 或 nslookup；返回本机公网 IP 才算生效
```

### 4.2 安全组 / 防火墙

```bash
# ufw（Ubuntu/Debian）
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# firewalld（CentOS/RHEL 系）
sudo firewall-cmd --permanent --add-service=http --add-service=https
sudo firewall-cmd --reload
```

云服务器还要在**控制台安全组**里放行 80 与 443 —— 本机防火墙开了、安全组没开，是最常见的一次性坑。

**不要对公网放行 3001**：应用监听在 `0.0.0.0:3001`，放行它等于同时开了一个没有 TLS 的入口。

### 4.3 签发证书

```bash
# Ubuntu/Debian
sudo apt-get update && sudo apt-get install -y certbot
# CentOS/RHEL 系：sudo dnf install -y certbot

sudo mkdir -p /var/www/certbot
sudo certbot certonly --webroot -w /var/www/certbot -d <你的域名>
```

用 `certonly`（不要用 `certbot --nginx`）：后者会重写 Nginx 配置，
之后"站点配置到底长什么样"就取决于 certbot 什么时候跑过一次。`certonly` 只发证书，
配置由本仓库的模板管。

### 4.4 用 443 模板替换安装器写的 HTTP 配置

模板：[`deploy/nginx/think-class-https.conf`](../../deploy/nginx/think-class-https.conf)
（443 + HTTP→HTTPS 跳转 + HSTS + 反代头 + `client_max_body_size 12m`）。

```bash
cd /class
sudo sed 's/<DOMAIN>/<你的域名>/g' deploy/nginx/think-class-https.conf \
  | sudo tee /etc/nginx/conf.d/think-class.conf > /dev/null
sudo nginx -t && sudo systemctl reload nginx
```

替换前请确认两件事：

1. **端口**：模板里写的是 `proxy_pass http://127.0.0.1:3001;`。如果安装时端口被自动换过，
   以 `/class/.env` 里的 `PORT` 为准改这一行。
2. **`client_max_body_size 12m` 不能删**：nginx 默认上限只有 1MB，
   而拍照题的图片上限是 10MB（`MAX_PHOTO_BYTES`，[`plugins/homework/src/homework.service.ts`](../../plugins/homework/src/homework.service.ts)）。
   删掉这行，稍大的手机照片会被 Nginx 直接 413，应用日志里什么都看不到。

### 4.5 证书续期

```bash
sudo certbot renew --dry-run     # 先演练
systemctl list-timers | grep certbot   # 确认续期定时器存在（certbot 包会自带）
```

续期只换文件、不改配置，所以**不需要重载 Nginx 之外的动作**；如果发现续期后浏览器仍报旧证书，
手动 `sudo systemctl reload nginx` 即可。

---

## 5. 验收命令（三条都要过）

```bash
# 1) HTTP 必须跳转到 HTTPS，且 HTTPS 返回 200
curl -I http://<你的域名>
curl -I https://<你的域名>
#    期望：301 → 200；响应头里有 strict-transport-security

# 2) 证书链与 TLS 版本（真机失败、开发者工具正常时，第一个要看的就是这里）
openssl s_client -connect <你的域名>:443 -servername <你的域名> </dev/null 2>/dev/null \
  | grep -E 'Verify return code|Protocol|Cipher'
#    期望：Verify return code: 0 (ok)；Protocol 是 TLSv1.2 或 TLSv1.3
openssl s_client -connect <你的域名>:443 -servername <你的域名> </dev/null 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates

# 3) 后端真的活着（这是小程序会调的那条路径）
curl -s https://<你的域名>/api/health
#    期望：{"success":true,...}，且 kernel.plugins.total / active 不为 0
```

补充检查：

```bash
sudo nginx -t                       # 配置语法
ss -lntp | grep -E ':(80|443|3001)' # 监听情况
pm2 logs think-class --lines 50     # 应用日志
sudo tail -50 /var/log/nginx/error.log
```

---

## 6. 更新

两条路，效果一样（都走 `update.sh`）：

```bash
# A. 服务器上手工执行
cd /class && sudo bash update.sh

# B. 超管后台「系统更新」一键更新（仅 Linux）
#    后台会检查最新 Release、spawn update.sh、把进度写进 logs/update.log
```

`update.sh` 的实际行为（可在 [`update.sh`](../../update.sh) 里逐行核对）：

| 阶段 | 行为 |
| --- | --- |
| 前置检查 | 必须有 PM2、必须有正在运行的 `think-class` 服务、Node ≥ 24 |
| 补齐配置 | `.env` 缺 `DATABASE_URL` / `ENCRYPTION_KEY` 时补齐（**只补缺失，永不覆盖已有密钥**） |
| 备份 | 整个安装目录打成 `backups/backup_<时间戳>.tar.gz`（排除 `backups`、`.git`、`node_modules`、`logs`） |
| 下载 | 取最新 Release，**校验 `SHA256SUMS`**，缺失或不匹配即中止 |
| 解包与安装 | 解包覆盖 → 更新 `CURRENT_VERSION` → `npm install` + `prisma generate` |
| 重启 | `pm2 restart think-class --update-env` + `pm2 save` |
| 失败 | 自动从备份回滚并重启；状态写进 `logs/update-status.json`，全过程在 `logs/update.log` |

更新后照第 5 节验收一遍。**更新不会动 `ENCRYPTION_KEY` 和数据库** ——
如果更新后学生姓名变乱码，那不是更新的锅，而是密钥/数据被换过，见 [40](40-troubleshooting.md)。

> 后台一键更新是 **Linux 专有**功能：`plugins/admin/src/admin.update.ts` 里
> `process.platform === 'linux'` 才提供，非 Linux 会返回 400。
> Windows 服务器用 [`update.ps1`](../../update.ps1)（同样会校验 `SHA256SUMS`）。

---

## 7. 备份与恢复

必须备份的四样，放在安装目录之外：

| 内容 | 路径 | 丢了会怎样 |
| --- | --- | --- |
| 配置与密钥 | `/class/.env` | **最严重**：`ENCRYPTION_KEY` 丢失 = 学生姓名永久不可读 |
| 数据库 | `/class/database.sqlite`（如存在 `-wal`/`-shm` 一起备） | 班级、作业、成绩全部丢失 |
| 上传文件 | `/class/uploads/` | 作业照片、试卷附件丢失 |
| 最近的更新备份 | `/class/backups/` | 回滚能力丢失（`update.sh` 每次自动生成） |

```bash
# 冷备示例（先停再拷，保证 SQLite 文件一致）
pm2 stop think-class
tar -czf /root/think-class-$(date +%F).tar.gz -C /class .env database.sqlite uploads
pm2 start think-class
```

恢复：把 `.env`（**必须是同一把 `ENCRYPTION_KEY`**）与数据库文件放回 `/class`，`pm2 restart think-class --update-env`。

---

## 8. 如果必须部署本分支（尚未发版）的代码

`install.sh` 的安装源是**最新 GitHub Release**（[`install.sh`](../../install.sh) 的
`download_latest_release()`），不是当前分支。要用本分支尚未发版的小程序后端，二选一：

1. **先发版**：走仓库的发版流程（tag → CI → GitHub Release，产物 `think-class-release.zip` + `SHA256SUMS`），
   然后照本文档 `install.sh` 正常装。
2. **手工部署**（不经过 `install.sh`）：

```bash
# 在服务器上，Node 24 已就绪
sudo mkdir -p /class && sudo chown "$USER" /class && cd /class
# 把本分支的代码放进来（git clone / scp / rsync 均可），然后：
npm ci                                          # 不能省 devDependencies：npm run start 用的是 tsx
npx prisma generate --schema prisma/schema.prisma
npm run build                                   # 生成 dist/，没有它首页 404
# 写 .env：至少 PORT / DATABASE_URL / SUPERADMIN_USERNAME / SUPERADMIN_PASSWORD / ENCRYPTION_KEY
# 以及 plugins/wechat 需要的 WECHAT_APPID / WECHAT_SECRET
pm2 start npm --name think-class -- run start
pm2 save
```

之后仍可用 `update.sh` 更新（它会覆盖代码但保留 `.env`、数据库、`uploads/`、`backups/`）。

---

## 9. 已知限制（Track B）

| 限制 | 后果 | 绕法 |
| --- | --- | --- |
| 仓库里没有 TLS | 安装完只有 HTTP/80 | 用 [`deploy/nginx/think-class-https.conf`](../../deploy/nginx/think-class-https.conf) + certbot（本文档第 4 节） |
| 安装器的 Nginx 模板没有 `client_max_body_size` | 照片上传 413（nginx 默认 1MB） | 换成 443 模板，或手动加 `client_max_body_size 12m;` |
| `install.sh` 不设 `NODE_ENV` | 进程以 development 模式运行 | 在 `.env` 里加 `NODE_ENV=production` 并 `pm2 restart --update-env` |
| `install.sh` 装的是最新 Release | 本分支未发版时装不到新代码 | 第 8 节：先发版，或手工部署 |
| 应用没有 `trust proxy` | 登录/审计日志里的 IP 是 127.0.0.1 | 无（本仓库范围内不可修） |
| SQLite 单写者 | 不能多实例/多进程写同一个库 | 只跑一个 PM2 进程（本方案默认） |
| `UPLOADS_DIR` 在当前组合不生效 | 只改它无效 | 上传目录固定为 `<安装目录>/uploads`，备份它即可 |
