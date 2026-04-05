#!/bin/bash
# 学习王国 - 一键自动安装脚本
# 支持 Ubuntu/Debian/CentOS 系统

set -e
trap 'echo -e "\n================================================="; echo -e "[错误] 安装脚本在第 $LINENO 行执行失败！"; echo -e "=================================================\n"; exit 1' ERR

# --- 全局变量配置 ---
PROJECT_NAME=${PROJECT_NAME:-"Think-Class"}
APP_NAME=${APP_NAME:-"think-class"}
REPO="xhnhhnh/Think-Claass"
PORT=3001

# --- 打印欢迎信息 ---
print_welcome() {
    echo "================================================="
    echo "      欢迎使用【${PROJECT_NAME}】一键自动部署脚本       "
    echo "================================================="
}

# --- 收集用户输入配置 ---
collect_inputs() {
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

    read -p "是否为您自动安装并配置 Nginx 反向代理 (直接通过域名访问，无需加端口)? (y/n, 默认: y): " SETUP_NGINX
    SETUP_NGINX=${SETUP_NGINX:-y}

    echo ""
    echo "即将开始安装，配置如下："
    echo "目标安装目录: $INSTALL_DIR"
    echo "绑定的域名/IP: $USER_DOMAIN"
    echo "超级后台路径: $ADMIN_PATH"
    echo "超级管理员账号: $SUPERADMIN_USERNAME"
    echo "超级管理员密码: $SUPERADMIN_PASSWORD"
    echo "自动配置 Nginx: $SETUP_NGINX"
    echo "================================================="
    read -p "按回车键继续，或按 Ctrl+C 取消..."
}

# --- 准备安装目录 ---
prepare_directory() {
    echo ">> 正在准备安装目录 ($INSTALL_DIR)..."
    sudo mkdir -p "$INSTALL_DIR"
    sudo chown -R $USER:$USER "$INSTALL_DIR"
    cd "$INSTALL_DIR"
}

# --- 检查并安装基础工具 ---
install_base_tools() {
    echo ">> 检查基础工具 (curl, unzip)..."
    local tools_to_install=""
    
    if ! command -v curl &> /dev/null; then
        tools_to_install="$tools_to_install curl"
    fi
    if ! command -v unzip &> /dev/null; then
        tools_to_install="$tools_to_install unzip"
    fi
    
    if [ -n "$tools_to_install" ]; then
        echo ">> 正在安装缺少的基础工具:$tools_to_install"
        if command -v apt-get &> /dev/null; then
            sudo apt-get update && sudo apt-get install -y $tools_to_install
        elif command -v yum &> /dev/null; then
            sudo yum install -y $tools_to_install
        fi
    fi
}

# --- 获取并下载最新版本 ---
download_latest_release() {
    echo ">> 正在获取 GitHub 最新版本信息..."
    LATEST_RELEASE=$(curl -s "https://api.github.com/repos/${REPO}/releases/latest")
    DOWNLOAD_URL=$(echo "$LATEST_RELEASE" | grep -o '"browser_download_url": *"[^"]*think-class-release.zip"' | cut -d '"' -f 4)
    LATEST_TAG=$(echo "$LATEST_RELEASE" | grep -o '"tag_name": *"[^"]*"' | cut -d '"' -f 4)

    if [ -z "$DOWNLOAD_URL" ]; then
        echo ">> [警告] 无法在 GitHub Releases 中找到 think-class-release.zip 部署包。"
        echo ">> 将尝试使用当前目录源码进行安装..."
    else
        echo ">> 发现最新版本: $LATEST_TAG"
        echo ">> 正在下载最新部署包..."
        curl -L -o think-class-release.zip "$DOWNLOAD_URL"
        
        echo ">> 正在解压部署包..."
        unzip -o think-class-release.zip
        rm think-class-release.zip
    fi
}

# --- 检查并安装编译依赖与 Node.js ---
install_node_and_deps() {
    echo ">> 检查编译依赖 (make, g++, python3)..."
    if ! command -v make &> /dev/null || ! command -v g++ &> /dev/null || ! command -v python3 &> /dev/null; then
        echo ">> 未检测到完整的编译依赖，正在为您安装..."
        if command -v apt-get &> /dev/null; then
            sudo apt-get update && sudo apt-get install -y build-essential python3
        elif command -v yum &> /dev/null; then
            sudo yum groupinstall -y "Development Tools"
            sudo yum install -y python3
        else
            echo ">> [警告] 无法自动安装编译依赖，后续如果 npm install 报错，请手动安装 make, gcc 和 python3。"
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
            echo ">> [错误] 不支持的系统包管理器。请手动安装 Node.js v18+ 后重试。"
            exit 1
        fi
    else
        NODE_VERSION=$(node -v)
        echo ">> 已检测到 Node.js，版本为 $NODE_VERSION"
    fi
}

# --- 检查并安装 PM2 ---
install_pm2() {
    if ! command -v pm2 &> /dev/null; then
        echo ">> 未检测到 PM2，正在全局安装 PM2..."
        sudo npm install -g pm2
    else
        echo ">> 已检测到 PM2"
    fi
}

# --- 生成环境变量配置 ---
generate_env() {
    echo ">> 正在生成环境配置文件 (.env)..."
    cat <<ENV_EOF > .env
# 自动生成的配置文件
SUPERADMIN_USERNAME=$SUPERADMIN_USERNAME
SUPERADMIN_PASSWORD=$SUPERADMIN_PASSWORD
VITE_API_URL=http://$USER_DOMAIN
VITE_ADMIN_PATH=$ADMIN_PATH
CURRENT_VERSION=$LATEST_TAG
PORT=$PORT
ENV_EOF
}

# --- 安装项目依赖并处理路径 ---
build_project() {
    echo ">> 正在安装项目依赖 (npm install)..."
    npm install

    if [ -z "$DOWNLOAD_URL" ]; then
        echo ">> 正在编译打包前端静态文件 (npm run build)..."
        npm run build
    fi

    # 替换前端打包文件中的自定义路径
    if [ "$ADMIN_PATH" != "/beiadmin" ] && [ -d "dist" ]; then
        echo ">> 正在配置自定义后台路径 ($ADMIN_PATH)..."
        find dist -type f \( -name "*.js" -o -name "*.html" \) -exec sed -i "s|/beiadmin|$ADMIN_PATH|g" {} +
    fi
}

# --- 启动服务 ---
start_service() {
    echo ">> 正在使用 PM2 启动 Node.js 后端服务..."
    if pm2 show $APP_NAME &> /dev/null; then
        echo ">> 发现同名服务，正在重启..."
        pm2 restart $APP_NAME --update-env
    else
        pm2 start npm --name "$APP_NAME" -- run start
    fi

    echo ">> 正在配置 PM2 开机自启动..."
    pm2 save
    sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u $USER --hp $HOME || true
}

# --- 配置 Nginx 反向代理 ---
setup_nginx() {
    if [[ "${SETUP_NGINX,,}" == "y" ]]; then
        echo ">> 正在检查并安装 Nginx..."
        if ! command -v nginx &> /dev/null; then
            if command -v apt-get &> /dev/null; then
                sudo apt-get update && sudo apt-get install -y nginx
            elif command -v yum &> /dev/null; then
                sudo yum install -y epel-release && sudo yum install -y nginx
            else
                echo ">> [警告] 无法自动安装 Nginx，请手动配置反向代理。"
                return
            fi
        fi

        echo ">> 正在配置 Nginx 反向代理 ($USER_DOMAIN -> 127.0.0.1:$PORT)..."
        local NGINX_CONF="/etc/nginx/conf.d/${APP_NAME}.conf"
        
        # 兼容 Ubuntu/Debian 的 sites-available
        if [ -d "/etc/nginx/sites-available" ]; then
            NGINX_CONF="/etc/nginx/sites-available/${APP_NAME}.conf"
        fi

        sudo bash -c "cat > $NGINX_CONF" <<EOF
server {
    listen 80;
    server_name $USER_DOMAIN;

    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

        if [ -d "/etc/nginx/sites-available" ]; then
            sudo ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/
        fi

        # 测试配置并重启
        if sudo nginx -t &> /dev/null; then
            sudo systemctl restart nginx
            sudo systemctl enable nginx
            echo ">> Nginx 反向代理配置成功！"
        else
            echo ">> [警告] Nginx 配置测试失败，请手动检查 $NGINX_CONF"
        fi
    fi
}

# --- 打印成功信息 ---
print_success() {
    echo "================================================="
    echo " 🎉 安装并启动成功！"
    echo "================================================="
    echo " 后端服务已运行在 $PORT 端口。"
    echo " 项目目录: $INSTALL_DIR"
    echo " 当前版本: ${LATEST_TAG:-未知}"
    if [[ "${SETUP_NGINX,,}" == "y" ]]; then
        echo " 访问地址: http://$USER_DOMAIN"
        echo " 超级后台: http://$USER_DOMAIN${ADMIN_PATH}/login"
    else
        echo " 访问地址: http://$USER_DOMAIN:$PORT"
        echo " 超级后台: http://$USER_DOMAIN:$PORT${ADMIN_PATH}/login"
    fi
    echo " 超管账号: $SUPERADMIN_USERNAME"
    echo " 超管密码: $SUPERADMIN_PASSWORD"
    echo "-------------------------------------------------"
    if [[ "${SETUP_NGINX,,}" != "y" ]]; then
        echo "提示：如果您后续使用 Nginx，请配置反向代理指向 127.0.0.1:$PORT"
    else
        echo "提示：已为您自动配置了 Nginx 反向代理，您可以直接使用域名访问了！"
    fi
    echo "================================================="
}

# --- 主执行流程 ---
main() {
    print_welcome
    collect_inputs
    prepare_directory
    install_base_tools
    download_latest_release
    install_node_and_deps
    install_pm2
    generate_env
    build_project
    start_service
    setup_nginx
    print_success
}

main
