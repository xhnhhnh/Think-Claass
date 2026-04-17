# 🩹 Think-Class v1.6.6 补丁发布：一键部署/更新更稳，功能模块继续完善

本次 **v1.6.6** 为补丁版本，聚焦两件事：**线上部署体验更稳定**、**业务功能与管理后台能力持续完善**。

## ✅ 部署与运维相关（重要）

- **一键安装脚本更健壮**
  - 支持安装时输入应用端口（默认 3001）
  - 端口被占用时可选择自动切换到可用端口，或尝试自动停止占用端口的进程
  - 可选在安装前自动停止 Nginx（释放 80 端口，减少 502 风险）
- **Prisma 环境更稳定**
  - 安装/更新过程中自动执行 `prisma generate`
  - 自动补齐 Prisma 所需的 `DATABASE_URL`（SQLite）

## ✨ 功能与体验

- 管理后台与多项学生/教师端页面能力继续完善（包含若干模块的接口、页面与测试补全）
- 修复与优化若干交互与数据请求路径，提升稳定性与可维护性

## 📦 部署包

- `think-class-v1.6.6.zip`

## 🚀 一键部署命令（Linux 服务器）

推荐在 **Ubuntu / Debian / CentOS** 等主流 Linux 服务器上使用（SSH 登录后执行）：

```bash
wget -O install.sh https://raw.githubusercontent.com/xhnhhnh/Think-Claass/main/install.sh && bash install.sh
```

如果服务器直连 GitHub 不稳定，可使用镜像加速版本：

```bash
wget -O install.sh https://ghproxy.net/https://raw.githubusercontent.com/xhnhhnh/Think-Claass/main/install.sh && bash install.sh
```

