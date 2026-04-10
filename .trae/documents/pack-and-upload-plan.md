# 任务计划：打包正式版并上传到 GitHub

## 目标
在本地进行正式版构建并打包（ZIP），然后将当前最新的代码强制推送到 GitHub 仓库（覆盖远程历史）。

## 当前状态分析
1. 远程 GitHub 仓库 `https://github.com/xhnhhnh/Think-Claass` 已经存在，但本地 Git 仓库处于无提交记录（`No commits yet`）的全新初始化状态，这会导致本地历史和远程历史不匹配。
2. 项目中有一个打包脚本 `pack.sh`，但由于当前运行环境是 Windows（PowerShell），Bash 脚本无法直接执行。我们需要使用等效的 PowerShell 命令来实现打包流程。
3. 发现 `.env` 环境变量文件、本地数据库 `database.sqlite` 以及 `.zip` 产物可能被意外追踪，已经将其加入到 `.gitignore` 中。

## 计划执行步骤

### 1. 打包正式版 (Release Build)
由于原有的 `pack.sh` 无法在 Windows 默认环境下运行，将使用 PowerShell 执行等效的打包操作：
- 运行 `npm run build` 进行前端静态资源编译。
- 创建临时目录 `release_build`。
- 将编译后的 `dist`、后端 `api` 目录、配置文件（`package.json`, `tsconfig.json` 等）以及部署脚本拷贝至临时目录。
- 使用 PowerShell 内置命令 `Compress-Archive` 将其压缩成 `think-class-release.zip`。
- 删除临时打包目录。

### 2. 提交代码并推送到 GitHub
- 重新扫描工作区，执行 `git add .` 将最新的修改加入暂存区（已被忽略的敏感文件及压缩包将不会被包含）。
- 执行 `git commit -m "Update project to latest version"` 进行本地提交。
- 确认远程仓库地址已设置为 `https://github.com/xhnhhnh/Think-Claass.git`。
- 执行 `git push -u origin master --force` 强制推送到远程仓库，覆盖旧有的历史记录。

## 假设与决定
- **强制推送（Force Push）**：这是基于你的选择。因为本地没有保留原本的 Git 历史，直接 Push 会报不相关历史的错误，因此我们将通过覆盖远端的方式进行代码上传。
- **网络连接**：此前检测到连接 GitHub 时可能存在网络重置的问题（Connection was reset）。如果推送时失败，我们会在最后提示你配置代理（如 `git config --global http.proxy`）再试一次。

## 验证
1. 确认项目根目录下成功生成了 `think-class-release.zip` 文件。
2. 观察 `git push` 命令的输出，如果显示强制更新成功，则代表已上传至 GitHub。