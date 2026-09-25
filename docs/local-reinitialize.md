# 本地实例重新初始化

仅用于尚未上线、允许清空业务数据的本地实例。执行后，旧账号、会话、班级、内容及数据库设置失效；源码、插件与工作区改动不受影响。

1. 停止本地 API 服务，再运行 `npm run local:reinitialize -- --check`。只有 `ready: true` 时继续。
2. 运行 `npm run local:reinitialize`，在终端设置新超管用户名和两次密码。密码输入不显示，命令没有默认密码。
3. 也可运行 `npm run local:reinitialize -- --generate`，生成唯一的随机超管用户名和密码。两者保存在命令所报备份目录的 `new-superadmin.txt`，不会打印到日志；Windows 上目录和文件仅授予当前用户访问权。首次登录后可在个人设置中更改密码。
4. 命令先在线备份 SQLite 数据库与原 `.env`，在 `manifest.json` 记录 SHA-256 并复验，才清空当前数据库、生成新的加密密钥和运行配置。
5. 启动 `npm run start`。检查 `/api/health`、新超管登录和旧凭据拒绝登录，再开始创建教师与班级。

备份位于当前用户主目录下的 `Think-Class-backups/before-local-reinitialize-<时间戳>`。该目录包含旧数据库和旧加密密钥，应像账号密码一样妥善保管。恢复旧数据时必须同时恢复同一备份目录中的 `database.sqlite` 和 `runtime.env`，并先停止 API 服务。
