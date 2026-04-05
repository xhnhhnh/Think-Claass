#!/bin/bash
# 学习王国 - 一键自动更新脚本
set -e

PROJECT_NAME=${PROJECT_NAME:-"Think-Class"}
APP_NAME=${APP_NAME:-"think-class"}

echo "================================================="
echo "      欢迎使用【${PROJECT_NAME}】一键自动更新脚本       "
echo "================================================="

# 1. 检查是否存在 PM2 服务
if ! pm2 show $APP_NAME &> /dev/null; then
    echo ">> 错误：未检测到运行中的 '${APP_NAME}' 服务。请先运行 install.sh 安装。"
    exit 1
fi

echo ">> 正在拉取最新的项目依赖 (npm install)..."
# 如果你有私有镜像源或依赖锁，可替换为 npm ci
npm install

echo ">> 正在重新编译前端静态文件 (npm run build)..."
npm run build

# 2. 重启 PM2 服务
echo ">> 正在重启 Node.js 后端服务 (pm2 restart $APP_NAME)..."
pm2 restart $APP_NAME --update-env

echo ">> 正在保存当前的 PM2 状态 (pm2 save)..."
pm2 save

echo "================================================="
echo " 🎉 更新并重启成功！"
echo "================================================="
echo " 当前状态可以通过运行 'pm2 logs $APP_NAME' 查看运行日志。"
echo "================================================="