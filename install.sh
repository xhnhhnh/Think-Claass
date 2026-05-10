#!/usr/bin/env bash
# Think-Class one-click install script for Ubuntu/Debian/CentOS-like servers.

set -Eeo pipefail
trap 'echo; echo "================================================="; echo "[错误] 安装脚本在第 $LINENO 行执行失败。"; echo "================================================="; exit 1' ERR

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/deploy-common.sh
source "$SCRIPT_DIR/scripts/deploy-common.sh"

PORT=${PORT:-3001}
INSTALL_DIR=${INSTALL_DIR:-/class}
ADMIN_PATH=${ADMIN_PATH:-/beiadmin}
SETUP_NGINX=${SETUP_NGINX:-y}
STOP_NGINX=${STOP_NGINX:-n}
AUTO_PICK_PORT=${AUTO_PICK_PORT:-y}
AUTO_KILL_PORT=${AUTO_KILL_PORT:-n}
LATEST_TAG=""
DOWNLOAD_URL=""

require_root() {
    [ "$EUID" -eq 0 ] || die "请使用 root 权限运行此脚本，例如: sudo bash install.sh"
}

preflight() {
    log "执行环境预检..."
    require_root
    [ -f /etc/os-release ] || die "无法检测操作系统类型。"
    . /etc/os-release
    case "$ID" in
        ubuntu|debian|centos|rhel|almalinux|rocky|fedora) ;;
        *) die "暂不支持的系统: $ID。建议使用 Ubuntu/Debian/CentOS/RHEL 系发行版。" ;;
    esac

    local available_space
    available_space=$(df -k / | awk 'NR==2 {print $4}')
    [ "$available_space" -ge 1048576 ] || die "根目录可用空间不足 1GB。"
    log "系统 ${PRETTY_NAME:-$ID}，可用空间 $((available_space / 1024)) MB。"
}

collect_inputs() {
    read -r -p "请输入绑定的域名或 IP: " USER_DOMAIN
    [ -n "$USER_DOMAIN" ] || die "域名或 IP 不能为空。"

    read -r -p "安装目录 (默认: ${INSTALL_DIR}): " input_install_dir
    INSTALL_DIR=${input_install_dir:-$INSTALL_DIR}

    read -r -p "超级后台路径 (默认: ${ADMIN_PATH}): " input_admin_path
    ADMIN_PATH=${input_admin_path:-$ADMIN_PATH}
    [[ "$ADMIN_PATH" == /* ]] || ADMIN_PATH="/$ADMIN_PATH"

    read -r -p "超级管理员账号 (默认: Think): " SUPERADMIN_USERNAME
    SUPERADMIN_USERNAME=${SUPERADMIN_USERNAME:-Think}

    read -r -p "超级管理员密码 (默认: wx951004): " SUPERADMIN_PASSWORD
    SUPERADMIN_PASSWORD=${SUPERADMIN_PASSWORD:-wx951004}

    read -r -p "应用端口 (默认: ${PORT}): " input_port
    PORT=${input_port:-$PORT}
    [[ "$PORT" =~ ^[0-9]+$ ]] && [ "$PORT" -ge 1 ] && [ "$PORT" -le 65535 ] || die "端口号不合法: $PORT"

    read -r -p "端口被占用时自动切换到可用端口? (y/n, 默认: ${AUTO_PICK_PORT}): " input_auto_pick
    AUTO_PICK_PORT=${input_auto_pick:-$AUTO_PICK_PORT}
    read -r -p "不切换端口时，是否自动停止占用进程? (y/n, 默认: ${AUTO_KILL_PORT}): " input_auto_kill
    AUTO_KILL_PORT=${input_auto_kill:-$AUTO_KILL_PORT}
    read -r -p "自动安装并配置 Nginx 反向代理? (y/n, 默认: ${SETUP_NGINX}): " input_nginx
    SETUP_NGINX=${input_nginx:-$SETUP_NGINX}

    if [[ "${SETUP_NGINX,,}" == "y" ]]; then
        read -r -p "安装前自动停止正在运行的 Nginx? (y/n, 默认: ${STOP_NGINX}): " input_stop_nginx
        STOP_NGINX=${input_stop_nginx:-$STOP_NGINX}
    fi

    echo
    log "即将安装到 ${INSTALL_DIR}，访问域名/IP 为 ${USER_DOMAIN}，端口 ${PORT}。"
    read -r -p "按回车继续，或 Ctrl+C 取消..."
}

stop_nginx() {
    if command -v systemctl >/dev/null 2>&1; then
        systemctl stop nginx >/dev/null 2>&1 || true
    elif command -v service >/dev/null 2>&1; then
        service nginx stop >/dev/null 2>&1 || true
    elif command -v nginx >/dev/null 2>&1; then
        nginx -s stop >/dev/null 2>&1 || true
    fi
}

stop_process_on_port() {
    local port="$1"
    local pid
    pid=$(get_pid_by_port "$port")
    [ -n "$pid" ] || return 1
    log "停止占用端口 ${port} 的进程 (PID=${pid})..."
    kill "$pid" 2>/dev/null || true
    sleep 1
    kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null || true
}

check_ports() {
    log "检查端口占用..."
    if is_port_in_use "$PORT"; then
        if [[ "${AUTO_PICK_PORT,,}" == "y" ]]; then
            local new_port
            new_port=$(pick_available_port "$((PORT + 1))" 200) || die "端口 ${PORT} 被占用，且未找到可用端口。"
            warn "端口 ${PORT} 被占用，已切换到 ${new_port}。"
            PORT=$new_port
        elif [[ "${AUTO_KILL_PORT,,}" == "y" ]]; then
            stop_process_on_port "$PORT" || die "无法自动停止占用端口 ${PORT} 的进程。"
            is_port_in_use "$PORT" && die "端口 ${PORT} 仍被占用。"
        else
            die "端口 ${PORT} 已被占用。"
        fi
    fi

    if [[ "${SETUP_NGINX,,}" == "y" ]] && is_port_in_use 80; then
        if [[ "${STOP_NGINX,,}" == "y" ]]; then
            stop_nginx
            sleep 1
            is_port_in_use 80 && die "80 端口仍被占用，无法配置 Nginx。"
        else
            die "80 端口已被占用。请选择不配置 Nginx，或先停止占用服务。"
        fi
    fi
}

prepare_directory() {
    log "准备安装目录 ${INSTALL_DIR}..."
    mkdir -p "$INSTALL_DIR"
    chown -R "${SUDO_USER:-$USER}:${SUDO_USER:-$USER}" "$INSTALL_DIR" || true
    cd "$INSTALL_DIR"
}

download_latest_release() {
    log "获取 GitHub 最新 Release..."
    local release_json
    release_json=$(github_latest_release_json)
    DOWNLOAD_URL=$(extract_latest_asset_url "$release_json")
    LATEST_TAG=$(extract_latest_tag "$release_json")

    if [ -z "$DOWNLOAD_URL" ]; then
        warn "未找到 Release 部署包，将使用当前目录源码构建。"
        return 0
    fi

    log "发现版本 ${LATEST_TAG:-未知}，正在安装部署包。"
    download_release_zip "$DOWNLOAD_URL" think-class-release.zip
    unzip -o think-class-release.zip
    rm -f think-class-release.zip
}

write_env() {
    log "写入 .env..."
    cat > .env <<ENV
SUPERADMIN_USERNAME=$SUPERADMIN_USERNAME
SUPERADMIN_PASSWORD=$SUPERADMIN_PASSWORD
VITE_API_URL=http://$USER_DOMAIN
VITE_ADMIN_PATH=$ADMIN_PATH
CURRENT_VERSION=$LATEST_TAG
PORT=$PORT
$DEFAULT_DATABASE_URL
ENV
}

build_project() {
    install_project_dependencies
    if [ -z "$DOWNLOAD_URL" ]; then
        log "构建前端静态资源..."
        npm run build
    fi
    replace_custom_admin_path "$ADMIN_PATH"
}

setup_pm2_startup() {
    restart_pm2_service "$APP_NAME"
    sudo env PATH="$PATH:/usr/bin" pm2 startup systemd -u "${SUDO_USER:-$USER}" --hp "${HOME}" || true
}

setup_nginx() {
    [[ "${SETUP_NGINX,,}" == "y" ]] || return 0

    ensure_commands nginx
    log "配置 Nginx 反向代理 ${USER_DOMAIN} -> 127.0.0.1:${PORT}..."
    local nginx_conf="/etc/nginx/conf.d/${APP_NAME}.conf"
    if [ -d "/etc/nginx/sites-available" ]; then
        nginx_conf="/etc/nginx/sites-available/${APP_NAME}.conf"
    fi

    cat > "$nginx_conf" <<EOF
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
        ln -sf "$nginx_conf" "/etc/nginx/sites-enabled/${APP_NAME}.conf"
    fi

    nginx -t
    systemctl restart nginx || service nginx restart
    systemctl enable nginx >/dev/null 2>&1 || true
}

print_success() {
    print_banner "安装完成"
    if [[ "${SETUP_NGINX,,}" == "y" ]]; then
        echo "访问地址: http://${USER_DOMAIN}"
    else
        echo "访问地址: http://${USER_DOMAIN}:${PORT}"
    fi
    echo "后台地址: http://${USER_DOMAIN}$([[ "${SETUP_NGINX,,}" == "y" ]] || printf ":%s" "$PORT")${ADMIN_PATH}/login"
    echo "安装目录: ${INSTALL_DIR}"
    echo "PM2 服务: ${APP_NAME}"
    echo "超管账号: ${SUPERADMIN_USERNAME}"
    echo "超管密码: ${SUPERADMIN_PASSWORD}"
    echo "================================================="
}

main() {
    print_banner "Think-Class 一键安装"
    preflight
    collect_inputs
    [[ "${STOP_NGINX,,}" == "y" ]] && stop_nginx
    ensure_commands curl unzip jq
    check_ports
    prepare_directory
    download_latest_release
    ensure_build_tools
    ensure_node "$REQUIRED_NODE_MAJOR"
    ensure_pm2
    write_env
    build_project
    setup_pm2_startup
    setup_nginx
    print_success
}

main "$@"
