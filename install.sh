#!/bin/bash
# 学习王国 - 一键自动安装脚本
# 仅支持 Ubuntu/Debian/CentOS 系统
set -e

PROJECT_NAME=${PROJECT_NAME:-"Think-Class"}
APP_NAME=${APP_NAME:-"think-class"}

echo "================================================="
echo "      欢迎使用【${PROJECT_NAME}】一键自动部署脚本       "
echo "================================================="

# 1. 收集用户输入
read -p "请输入您绑定的域名或 IP 地址 (如 example.com 或 12.34.56.78): " USER_DOMAIN
if [ -z "$USER_DOMAIN" ]; then
  echo "域名或 IP 不能为空！退出安装。"
  exit 1
fi

read -p "请输入超级后台管理员账号 (默认: Think): " SUPERADMIN_USERNAME
SUPERADMIN_USERNAME=${SUPERADMIN_USERNAME:-Think}

read -p "请输入超级后台管理员密码 (默认: wx951004): " SUPERADMIN_PASSWORD
SUPERADMIN_PASSWORD=${SUPERADMIN_PASSWORD:-wx951004}

echo ""
echo "即将开始安装，配置如下："
echo "绑定的域名/IP: $USER_DOMAIN"
echo "超级管理员账号: $SUPERADMIN_USERNAME"
echo "超级管理员密码: $SUPERADMIN_PASSWORD"
echo "================================================="
read -p "按回车键继续，或按 Ctrl+C 取消..."

# 2. 检查并安装 Node.js (v18+)
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

# 3. 检查并安装 PM2
if ! command -v pm2 &> /dev/null; then
    echo ">> 未检测到 PM2，正在全局安装 PM2..."
    sudo npm install -g pm2
else
    echo ">> 已检测到 PM2"
fi

# 4. 生成 .env 文件
echo ">> 正在生成环境配置文件 (.env)..."
cat <<EOF > .env
# 自动生成的配置文件
SUPERADMIN_USERNAME=$SUPERADMIN_USERNAME
SUPERADMIN_PASSWORD=$SUPERADMIN_PASSWORD
VITE_API_URL=http://$USER_DOMAIN
PORT=3001
EOF

# 5. 安装依赖与打包
echo ">> 正在安装项目依赖 (npm install)..."
npm install

echo ">> 正在编译打包前端静态文件 (npm run build)..."
npm run build

# 6. 使用 PM2 启动服务
echo ">> 正在使用 PM2 启动 Node.js 后端服务..."
# 检查是否已存在同名服务
if pm2 show $APP_NAME &> /dev/null; then
    echo ">> 发现同名服务，正在重启..."
    pm2 restart $APP_NAME --update-env
else
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
echo " 访问地址: http://$USER_DOMAIN:3001"
echo " 超级后台: http://$USER_DOMAIN:3001/beiadmin/login"
echo " 超管账号: $SUPERADMIN_USERNAME"
echo " 超管密码: $SUPERADMIN_PASSWORD"
echo "-------------------------------------------------"
echo "提示：如果您使用 Nginx，请配置反向代理指向 127.0.0.1:3001"
echo "================================================="