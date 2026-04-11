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

# --- 环境预检 ---
pre_flight_checks() {
    echo ">> 执行环境预检..."
    
    # 1. 检查 root 权限
    if [ "$EUID" -ne 0 ]; then
        echo "[错误] 请使用 root 权限运行此脚本 (例如: sudo bash install.sh)"
        exit 1
    fi
    
    # 2. 检查操作系统类型
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS=$ID
    else
        echo "[错误] 无法检测操作系统类型。"
        exit 1
    fi
    
    case $OS in
        ubuntu|debian)
            PKG_MANAGER="apt-get"
            ;;
        centos|rhel|almalinux|rocky)
            PKG_MANAGER="yum"
            ;;
        *)
            echo "[错误] 不支持的操作系统: $OS。仅支持 Ubuntu/Debian 或 CentOS/RHEL 及其衍生版。"
            exit 1
            ;;
    esac
    echo ">> 检测到操作系统: $OS ($PKG_MANAGER)"
    
    # 3. 检查可用磁盘空间 (最小 1GB)
    local min_space=1048576 # 1GB in KB
    local available_space=$(df -k / | awk 'NR==2 {print $4}')
    if [ "$available_space" -lt "$min_space" ]; then
        echo "[错误] 根目录可用空间不足 1GB (当前: $((available_space / 1024)) MB)。"
        exit 1
    fi
    echo ">> 磁盘空间充足: $((available_space / 1024)) MB 可用。"
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

    if [[ "${SETUP_NGINX,,}" == "y" ]]; then
        read -p "是否在安装前自动停止正在运行的 Nginx (释放 80 端口)? (y/n, 默认: n): " STOP_NGINX
        STOP_NGINX=${STOP_NGINX:-n}
    else
        STOP_NGINX="n"
    fi

    echo ""
    echo "即将开始安装，配置如下："
    echo "目标安装目录: $INSTALL_DIR"
    echo "绑定的域名/IP: $USER_DOMAIN"
    echo "超级后台路径: $ADMIN_PATH"
    echo "超级管理员账号: $SUPERADMIN_USERNAME"
    echo "超级管理员密码: $SUPERADMIN_PASSWORD"
    echo "自动配置 Nginx: $SETUP_NGINX"
    echo "安装前停止 Nginx: $STOP_NGINX"
    echo "================================================="
    read -p "按回车键继续，或按 Ctrl+C 取消..."
}

# --- 停止 Nginx（可选） ---
stop_nginx() {
    if command -v systemctl &> /dev/null; then
        systemctl stop nginx &> /dev/null || true
    elif command -v service &> /dev/null; then
        service nginx stop &> /dev/null || true
    elif command -v nginx &> /dev/null; then
        nginx -s stop &> /dev/null || true
    fi
}

stop_nginx_if_requested() {
    if [[ "${STOP_NGINX,,}" == "y" ]]; then
        echo ">> 正在停止 Nginx..."
        stop_nginx
        sleep 1
    fi
}

# --- 检查端口占用情况 ---
check_ports() {
    echo ">> 检查端口占用情况..."
    if command -v ss &> /dev/null || command -v netstat &> /dev/null; then
        local check_cmd="ss -tuln"
        if ! command -v ss &> /dev/null; then
            check_cmd="netstat -tuln"
        fi
        
        if $check_cmd | grep -q ":$PORT "; then
            echo "[错误] 端口 $PORT 已被占用，请修改应用端口或停止占用该端口的服务。"
            exit 1
        fi
        
        if [[ "${SETUP_NGINX,,}" == "y" ]]; then
            if $check_cmd | grep -q ":80 "; then
                if [[ "${STOP_NGINX,,}" == "y" ]]; then
                    echo ">> 检测到 80 端口被占用，尝试停止 Nginx 后重新检测..."
                    stop_nginx
                    sleep 1
                    if $check_cmd | grep -q ":80 "; then
                        echo "[错误] 端口 80 仍被占用。请手动停止占用 80 端口的服务或选择不自动配置 Nginx。"
                        exit 1
                    fi
                else
                    echo "[错误] 端口 80 已被占用。Nginx 需要使用 80 端口，请停止占用该端口的服务或选择不自动配置 Nginx。"
                    exit 1
                fi
            fi
        fi
    else
        echo ">> [警告] 无法检测端口占用情况，缺少 ss 或 netstat 命令。"
    fi
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
    echo ">> 检查基础工具 (curl, unzip, jq)..."
    local tools_to_install=""
    
    if ! command -v curl &> /dev/null; then tools_to_install="$tools_to_install curl"; fi
    if ! command -v unzip &> /dev/null; then tools_to_install="$tools_to_install unzip"; fi
    if ! command -v jq &> /dev/null; then tools_to_install="$tools_to_install jq"; fi
    
    if [ -n "$tools_to_install" ]; then
        echo ">> 正在安装缺少的基础工具:$tools_to_install"
        if [ "$PKG_MANAGER" == "apt-get" ]; then
            sudo apt-get update && sudo apt-get install -y $tools_to_install
        elif [ "$PKG_MANAGER" == "yum" ]; then
            sudo yum install -y epel-release || true
            sudo yum install -y $tools_to_install
        fi
    fi
}

# --- 自动选择可用的 GitHub 下载地址 ---
get_github_url() {
    local original_url=$1
    
    # 定义候选镜像源列表（包括原始地址）
    local mirrors=(
        "$original_url"
        "https://ghproxy.net/$original_url"
        "https://mirror.ghproxy.com/$original_url"
        "https://scproxy.freedns.eu.org/$original_url"
    )

    echo ">> 正在寻找最快的 GitHub 下载节点..." >&2
    for mirror in "${mirrors[@]}"; do
        if curl -s -I -m 5 "$mirror" | grep -q -E "^HTTP/.* (200|302)"; then
            echo "$mirror"
            return 0
        fi
    done
    
    # 如果全部失败，返回原始 URL 作为后备
    echo "$original_url"
}

# --- 获取并下载最新版本 ---
download_latest_release() {
    echo ">> 正在获取 GitHub 最新版本信息..."
    local api_url="https://api.github.com/repos/${REPO}/releases/latest"
    LATEST_RELEASE=$(curl -s "$api_url")
    
    # 检查是否因为 API 限制被拦截
    if [ -z "$LATEST_RELEASE" ] || echo "$LATEST_RELEASE" | grep -q "API rate limit exceeded"; then
         echo ">> [警告] 直接获取 GitHub API 失败或受到速率限制。"
         echo ">> 将尝试使用当前目录源码进行安装..."
         DOWNLOAD_URL=""
         return 0
    fi

    if command -v jq &> /dev/null; then
        DOWNLOAD_URL=$(echo "$LATEST_RELEASE" | jq -r '.assets[] | select(.name | test("think-class-v[0-9.]*\\.zip$")) | .browser_download_url' | head -n 1)
        if [ -z "$DOWNLOAD_URL" ]; then
            DOWNLOAD_URL=$(echo "$LATEST_RELEASE" | jq -r '.assets[] | select(.name | test("think-class-release\\.zip$")) | .browser_download_url' | head -n 1)
        fi
        if [ -z "$DOWNLOAD_URL" ]; then
            DOWNLOAD_URL=$(echo "$LATEST_RELEASE" | jq -r '.assets[] | select(.name | test("think-class-.*\\.zip$")) | .browser_download_url' | head -n 1)
        fi
        LATEST_TAG=$(echo "$LATEST_RELEASE" | jq -r '.tag_name // empty')
    else
        DOWNLOAD_URL=$(echo "$LATEST_RELEASE" | grep -o '"browser_download_url": *"[^"]*think-class-v[0-9.]*\.zip"' | cut -d '"' -f 4 | head -n 1)
        if [ -z "$DOWNLOAD_URL" ]; then
            DOWNLOAD_URL=$(echo "$LATEST_RELEASE" | grep -o '"browser_download_url": *"[^"]*think-class-release\.zip"' | cut -d '"' -f 4 | head -n 1)
        fi
        if [ -z "$DOWNLOAD_URL" ]; then
            DOWNLOAD_URL=$(echo "$LATEST_RELEASE" | grep -o '"browser_download_url": *"[^"]*think-class-.*\.zip"' | cut -d '"' -f 4 | head -n 1)
        fi
        LATEST_TAG=$(echo "$LATEST_RELEASE" | grep -o '"tag_name": *"[^"]*"' | cut -d '"' -f 4)
    fi

    if [ -z "$DOWNLOAD_URL" ]; then
        echo ">> [警告] 无法在 GitHub Releases 中找到对应的 .zip 部署包。"
        echo ">> 将尝试使用当前目录源码进行安装..."
    else
        echo ">> 发现最新版本: $LATEST_TAG"
        
        # 将原始下载 URL 转换为最快的镜像 URL
        FAST_DOWNLOAD_URL=$(get_github_url "$DOWNLOAD_URL")
        
        echo ">> 正在下载最新部署包 ($FAST_DOWNLOAD_URL)..."
        if ! curl -L -o think-class-release.zip "$FAST_DOWNLOAD_URL"; then
            echo ">> [错误] 下载部署包失败，将回退到源码安装..."
            DOWNLOAD_URL="" # 置空以触发后续的源码编译逻辑
        else
            echo ">> 正在解压部署包..."
            unzip -o think-class-release.zip
            rm think-class-release.zip
        fi
    fi
}

# --- 检查并安装编译依赖与 Node.js ---
install_node_and_deps() {
    echo ">> 检查编译依赖 (make, g++, python3)..."
    if ! command -v make &> /dev/null || ! command -v g++ &> /dev/null || ! command -v python3 &> /dev/null; then
        echo ">> 未检测到完整的编译依赖，正在为您安装..."
        if [ "$PKG_MANAGER" == "apt-get" ]; then
            sudo apt-get update && sudo apt-get install -y build-essential python3
        elif [ "$PKG_MANAGER" == "yum" ]; then
            sudo yum groupinstall -y "Development Tools"
            sudo yum install -y python3
        else
            echo ">> [警告] 无法自动安装编译依赖，后续如果 npm install 报错，请手动安装 make, gcc 和 python3。"
        fi
    fi

    if command -v node &> /dev/null; then
        NODE_VERSION=$(node -v | cut -d 'v' -f 2)
        NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d '.' -f 1)
        if [ "$NODE_MAJOR" -lt 24 ]; then
            echo ">> 检测到 Node.js 版本 ($NODE_VERSION) 低于 v24，准备升级到 Node.js 24 LTS..."
        else
            echo ">> 已检测到 Node.js，版本为 v$NODE_VERSION，满足 Node.js 24 LTS 要求。"
            return 0
        fi
    else
        echo ">> 未检测到 Node.js，正在自动安装 Node.js 24 LTS..."
    fi

    if [ "$PKG_MANAGER" == "apt-get" ]; then
        curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
        sudo apt-get install -y nodejs
    elif [ "$PKG_MANAGER" == "yum" ]; then
        curl -fsSL https://rpm.nodesource.com/setup_24.x | sudo bash -
        sudo yum install -y nodejs
    else
        echo ">> [错误] 不支持的系统包管理器。请手动安装 Node.js 24 LTS 后重试。"
        exit 1
    fi
}

# --- 检查并安装 PM2 ---
install_pm2() {
    if ! command -v pm2 &> /dev/null; then
        echo ">> 未检测到 PM2，正在全局安装 PM2..."
        sudo npm install -g pm2
    else
        PM2_VERSION=$(pm2 -v)
        echo ">> 已检测到 PM2，当前版本为 $PM2_VERSION"
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
    rm -rf node_modules package-lock.json pnpm-lock.yaml
    npm install

    if [ -f "prisma/schema.prisma" ]; then
        echo ">> 正在生成 Prisma Client (npx prisma generate)..."
        npx prisma generate --schema prisma/schema.prisma
    else
        echo ">> [警告] 未找到 prisma/schema.prisma，已跳过 Prisma Client 生成。"
    fi

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
            if [ "$PKG_MANAGER" == "apt-get" ]; then
                sudo apt-get update && sudo apt-get install -y nginx
            elif [ "$PKG_MANAGER" == "yum" ]; then
                sudo yum install -y epel-release && sudo yum install -y nginx
            else
                echo ">> [警告] 无法自动安装 Nginx，请手动配置反向代理。"
                return 0
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
    pre_flight_checks
    collect_inputs
    stop_nginx_if_requested
    check_ports
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
