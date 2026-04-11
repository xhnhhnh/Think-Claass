# 🩹 Think-Class v1.6.1 补丁发布：部署稳定性与脚本完善

本次 **v1.6.1** 为补丁版本，重点修复生产部署过程中的稳定性问题，并完善一键安装/更新/打包脚本，减少线上环境踩坑成本。

## ✅ 关键修复

- **Prisma 运行时修复**
  - 部署后自动执行 `prisma generate`，避免出现 `@prisma/client did not initialize yet` 导致后端启动失败
  - 打包时包含 `prisma/` 目录（包含 `schema.prisma`），确保线上可生成 Prisma Client

- **一键脚本增强**
  - `install.sh` / `update.sh` 增强 Prisma 相关处理（安装/更新/回滚后自动重新生成 Prisma Client）
  - `install.sh` 增加可选的 **安装前停止 Nginx**（释放 80 端口，减少 502 风险）

## 📦 部署包

- `think-class-v1.6.1.zip`

