#!/bin/bash
# 学习王国 - 一键自动更新脚本
set -e
trap 'echo "================================================="; echo "[错误] 更新脚本在第 $LINENO 行执行失败！"; echo "================================================="; exit 1' ERR

PROJECT_NAME=${PROJECT_NAME:-"Think-Class"}
APP_NAME=${APP_NAME:-"think-class"}
REPO="xhnhhnh/Think-Claass"

echo "================================================="
echo "      欢迎使用【${PROJECT_NAME}】一键自动更新脚本       "
echo "================================================="

# 1. 检查是否存在 PM2 服务
if ! pm2 show $APP_NAME &> /dev/null; then
    echo ">> 错误：未检测到运行中的 '${APP_NAME}' 服务。请先运行 install.sh 安装。"
    exit 1
fi

# 2. 自动备份数据
BACKUP_DIR="data_backup_$(date +%Y%m%d_%H%M%S)"
echo ">> 正在备份数据库到 $BACKUP_DIR..."
if [ -d "data" ]; then
    cp -r data "$BACKUP_DIR"
    echo ">> 备份完成！"
else
    echo ">> 未检测到 data 目录，跳过备份。"
fi

# 3. 获取最新版本并下载
echo ">> 正在获取 GitHub 最新版本信息..."
if ! command -v curl &> /dev/null; then
    sudo apt-get update && sudo apt-get install -y curl || sudo yum install -y curl
fi
if ! command -v unzip &> /dev/null; then
    sudo apt-get update && sudo apt-get install -y unzip || sudo yum install -y unzip
fi

LATEST_RELEASE=$(curl -s "https://api.github.com/repos/${REPO}/releases/latest")
DOWNLOAD_URL=$(echo "$LATEST_RELEASE" | grep -o '"browser_download_url": *"[^"]*think-class-release.zip"' | cut -d '"' -f 4)
LATEST_TAG=$(echo "$LATEST_RELEASE" | grep -o '"tag_name": *"[^"]*"' | cut -d '"' -f 4)

if [ -z "$DOWNLOAD_URL" ]; then
    echo ">> [警告] 无法在 GitHub Releases 中找到 think-class-release.zip 部署包。"
    echo ">> 将尝试使用 npm run build 进行本地源码更新..."
    echo ">> 正在拉取最新的项目依赖 (npm install)..."
    npm install
    echo ">> 正在重新编译前端静态文件 (npm run build)..."
    npm run build
else
    echo ">> 发现最新版本: $LATEST_TAG"
    echo ">> 正在下载最新部署包..."
    curl -L -o think-class-release.zip "$DOWNLOAD_URL"
    
    echo ">> 正在解压并覆盖现有文件 (保留 .env 和 data)..."
    unzip -o think-class-release.zip
    rm think-class-release.zip

    # 4. 更新 .env 中的版本号
    if grep -q "CURRENT_VERSION=" .env; then
        sed -i "s/CURRENT_VERSION=.*/CURRENT_VERSION=$LATEST_TAG/g" .env
    else
        echo "CURRENT_VERSION=$LATEST_TAG" >> .env
    fi

    echo ">> 正在拉取最新的项目依赖 (npm install)..."
    npm install
fi

# 获取当前环境的 ADMIN_PATH 并替换前端打包文件
ADMIN_PATH=$(grep VITE_ADMIN_PATH .env | cut -d '=' -f2)
ADMIN_PATH=${ADMIN_PATH:-/beiadmin}
if [ "$ADMIN_PATH" != "/beiadmin" ] && [ -d "dist" ]; then
    echo ">> 正在恢复自定义后台路径 ($ADMIN_PATH)..."
    find dist -type f \( -name "*.js" -o -name "*.html" \) -exec sed -i "s|/beiadmin|$ADMIN_PATH|g" {} +
fi

# 5. 重启 PM2 服务
echo ">> 正在重启 Node.js 后端服务 (pm2 restart $APP_NAME)..."
pm2 restart $APP_NAME --update-env

echo ">> 正在保存当前的 PM2 状态 (pm2 save)..."
pm2 save

echo "================================================="
echo " 🎉 更新并重启成功！"
echo "================================================="
echo " 当前状态可以通过运行 'pm2 logs $APP_NAME' 查看运行日志。"
echo "================================================="
