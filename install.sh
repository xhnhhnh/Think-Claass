#!/bin/bash
# 学习王国 - 一键自动安装脚本
# 支持 Ubuntu/Debian/CentOS 系统
set -e
trap 'echo "================================================="; echo "[错误] 安装脚本在第 $LINENO 行执行失败！"; echo "================================================="; exit 1' ERR

PROJECT_NAME=${PROJECT_NAME:-"Think-Class"}
APP_NAME=${APP_NAME:-"think-class"}
REPO="xhnhhnh/Think-Claass"

echo "================================================="
echo "      欢迎使用【${PROJECT_NAME}】一键自动部署脚本       "
echo "================================================="

# 1. 收集用户输入
read -p "请输入您绑定的域名或 IP 地址 (如 example.com 或 12.34.56.78): " USER_DOMAIN
if [ -z "$USER_DOMAIN" ]; then
  echo "域名或 IP 不能为空！退出安装。"
  exit 1
fi

read -p "请输入你想安装的目录路径 (默认: /class): " INSTALL_DIR
INSTALL_DIR=${INSTALL_DIR:-/class}

read -p "请输入超级后台的自定义访问路径 (默认: /beiadmin): " ADMIN_PATH
ADMIN_PATH=${ADMIN_PATH:-/beiadmin}
if [[ "$ADMIN_PATH" != /* ]]; then
  ADMIN_PATH="/$ADMIN_PATH"
fi

read -p "请输入超级后台管理员账号 (默认: Think): " SUPERADMIN_USERNAME
SUPERADMIN_USERNAME=${SUPERADMIN_USERNAME:-Think}

read -p "请输入超级后台管理员密码 (默认: wx951004): " SUPERADMIN_PASSWORD
SUPERADMIN_PASSWORD=${SUPERADMIN_PASSWORD:-wx951004}

echo ""
echo "即将开始安装，配置如下："
echo "目标安装目录: $INSTALL_DIR"
echo "绑定的域名/IP: $USER_DOMAIN"
echo "超级后台路径: $ADMIN_PATH"
echo "超级管理员账号: $SUPERADMIN_USERNAME"
echo "超级管理员密码: $SUPERADMIN_PASSWORD"
echo "================================================="
read -p "按回车键继续，或按 Ctrl+C 取消..."

# 2. 准备安装目录并拉取最新 Release
echo ">> 正在准备安装目录 ($INSTALL_DIR)..."
sudo mkdir -p "$INSTALL_DIR"
sudo chown -R $USER:$USER "$INSTALL_DIR"
cd "$INSTALL_DIR"

echo ">> 正在获取 GitHub 最新版本信息..."
if ! command -v curl &> /dev/null; then
    echo ">> 未检测到 curl，正在安装..."
    sudo apt-get update && sudo apt-get install -y curl || sudo yum install -y curl
fi
if ! command -v unzip &> /dev/null; then
    echo ">> 未检测到 unzip，正在安装..."
    sudo apt-get update && sudo apt-get install -y unzip || sudo yum install -y unzip
fi

LATEST_RELEASE=$(curl -s "https://api.github.com/repos/${REPO}/releases/latest")
DOWNLOAD_URL=$(echo "$LATEST_RELEASE" | grep -o '"browser_download_url": *"[^"]*think-class-release.zip"' | cut -d '"' -f 4)
LATEST_TAG=$(echo "$LATEST_RELEASE" | grep -o '"tag_name": *"[^"]*"' | cut -d '"' -f 4)

if [ -z "$DOWNLOAD_URL" ]; then
    echo ">> [警告] 无法在 GitHub Releases 中找到 think-class-release.zip 部署包。"
    echo ">> 将尝试使用当前目录源码进行安装..."
    # 假设当前目录包含源码
else
    echo ">> 发现最新版本: $LATEST_TAG"
    echo ">> 正在下载最新部署包..."
    curl -L -o think-class-release.zip "$DOWNLOAD_URL"
    
    echo ">> 正在解压部署包..."
    unzip -o think-class-release.zip
    rm think-class-release.zip
fi

# 3. 检查并安装 Node.js (v18+) 及编译依赖
echo ">> 检查编译依赖 (make, g++, python3)..."
if ! command -v make &> /dev/null || ! command -v g++ &> /dev/null || ! command -v python3 &> /dev/null; then
    echo ">> 未检测到完整的编译依赖，正在为您安装..."
    if command -v apt-get &> /dev/null; then
        sudo apt-get update && sudo apt-get install -y build-essential python3
    elif command -v yum &> /dev/null; then
        sudo yum groupinstall -y "Development Tools"
        sudo yum install -y python3
    else
        echo ">> [警告] 无法自动安装编译依赖，后续如果 npm install (如 better-sqlite3) 报错，请手动安装 make, gcc 和 python3。"
    fi
fi

if ! command -v node &> /dev/null; then
    echo ">> 未检测到 Node.js，正在自动安装 Node.js v18..."
    if command -v apt-get &> /dev/null; then
        curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
        sudo apt-get install -y nodejs
    elif command -v yum &> /dev/null; then
        curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
        sudo yum install -y nodejs
    else
        echo "不支持的系统包管理器。请手动安装 Node.js v18+ 后重试。"
        exit 1
    fi
else
    NODE_VERSION=$(node -v)
    echo ">> 已检测到 Node.js，版本为 $NODE_VERSION"
fi

# 4. 检查并安装 PM2
if ! command -v pm2 &> /dev/null; then
    echo ">> 未检测到 PM2，正在全局安装 PM2..."
    sudo npm install -g pm2
else
    echo ">> 已检测到 PM2"
fi

# 5. 生成 .env 文件
echo ">> 正在生成环境配置文件 (.env)..."
cat <<ENV_EOF > .env
# 自动生成的配置文件
SUPERADMIN_USERNAME=$SUPERADMIN_USERNAME
SUPERADMIN_PASSWORD=$SUPERADMIN_PASSWORD
VITE_API_URL=http://$USER_DOMAIN
VITE_ADMIN_PATH=$ADMIN_PATH
CURRENT_VERSION=$LATEST_TAG
PORT=3001
ENV_EOF

# 6. 安装依赖与打包
echo ">> 正在安装项目依赖 (npm install)..."
npm install

if [ -z "$DOWNLOAD_URL" ]; then
    echo ">> 正在编译打包前端静态文件 (npm run build)..."
    npm run build
fi

# 替换前端打包文件中的 /beiadmin 路径
if [ "$ADMIN_PATH" != "/beiadmin" ] && [ -d "dist" ]; then
    echo ">> 正在配置自定义后台路径 ($ADMIN_PATH)..."
    find dist -type f \( -name "*.js" -o -name "*.html" \) -exec sed -i "s|/beiadmin|$ADMIN_PATH|g" {} +
fi

# 7. 使用 PM2 启动服务
echo ">> 正在使用 PM2 启动 Node.js 后端服务..."
# 检查是否已存在同名服务
if pm2 show $APP_NAME &> /dev/null; then
    echo ">> 发现同名服务，正在重启..."
    pm2 restart $APP_NAME --update-env
else
    # 如果是 release 包，可能是 tsx 启动或者 node 启动
    pm2 start npm --name "$APP_NAME" -- run start
fi

# 设置开机自启
echo ">> 正在配置 PM2 开机自启动..."
pm2 save
# 注意：pm2 startup 需要 root 权限，脚本会自动提示用户执行对应的命令，或者静默执行
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u $USER --hp $HOME || true

echo "================================================="
echo " 🎉 安装并启动成功！"
echo "================================================="
echo " 后端服务已运行在 3001 端口。"
echo " 项目目录: $INSTALL_DIR"
echo " 当前版本: ${LATEST_TAG:-未知}"
echo " 访问地址: http://$USER_DOMAIN:3001"
echo " 超级后台: http://$USER_DOMAIN:3001${ADMIN_PATH}/login"
echo " 超管账号: $SUPERADMIN_USERNAME"
echo " 超管密码: $SUPERADMIN_PASSWORD"
echo "-------------------------------------------------"
echo "提示：如果您使用 Nginx，请配置反向代理指向 127.0.0.1:3001"
echo "================================================="
