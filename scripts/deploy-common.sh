#!/usr/bin/env bash

# Shared helpers for Think-Class one-click install, update and package scripts.

set -Eeo pipefail

PROJECT_NAME=${PROJECT_NAME:-"Think-Class"}
APP_NAME=${APP_NAME:-"think-class"}
REPO=${REPO:-"xhnhhnh/Think-Claass"}
REQUIRED_NODE_MAJOR=${REQUIRED_NODE_MAJOR:-24}
DEFAULT_DATABASE_URL=${DEFAULT_DATABASE_URL:-'DATABASE_URL="file:./database.sqlite"'}

log() {
    echo ">> $*"
}

warn() {
    echo ">> [警告] $*" >&2
}

die() {
    echo ">> [错误] $*" >&2
    exit 1
}

print_banner() {
    local title="$1"
    echo "================================================="
    echo "      ${title}"
    echo "================================================="
}

detect_package_manager() {
    if command -v apt-get >/dev/null 2>&1; then
        echo "apt-get"
    elif command -v dnf >/dev/null 2>&1; then
        echo "dnf"
    elif command -v yum >/dev/null 2>&1; then
        echo "yum"
    else
        echo ""
    fi
}

install_packages() {
    local packages=("$@")
    local manager
    manager=$(detect_package_manager)

    [ ${#packages[@]} -gt 0 ] || return 0
    [ -n "$manager" ] || die "无法识别系统包管理器，请手动安装: ${packages[*]}"

    log "安装系统依赖: ${packages[*]}"
    case "$manager" in
        apt-get)
            sudo apt-get update
            sudo apt-get install -y "${packages[@]}"
            ;;
        dnf)
            sudo dnf install -y "${packages[@]}"
            ;;
        yum)
            sudo yum install -y epel-release || true
            sudo yum install -y "${packages[@]}"
            ;;
    esac
}

ensure_commands() {
    local missing=()
    local command_name

    for command_name in "$@"; do
        if ! command -v "$command_name" >/dev/null 2>&1; then
            missing+=("$command_name")
        fi
    done

    if [ ${#missing[@]} -gt 0 ]; then
        install_packages "${missing[@]}"
    fi
}

ensure_build_tools() {
    local manager
    manager=$(detect_package_manager)

    if command -v make >/dev/null 2>&1 && command -v g++ >/dev/null 2>&1 && command -v python3 >/dev/null 2>&1; then
        return 0
    fi

    log "安装 native 依赖编译工具..."
    case "$manager" in
        apt-get)
            sudo apt-get update
            sudo apt-get install -y build-essential python3
            ;;
        dnf)
            sudo dnf groupinstall -y "Development Tools" || true
            sudo dnf install -y python3
            ;;
        yum)
            sudo yum groupinstall -y "Development Tools" || true
            sudo yum install -y python3
            ;;
        *)
            warn "无法自动安装 make/g++/python3；若 npm install 失败，请手动补齐。"
            ;;
    esac
}

ensure_node() {
    local required_major=${1:-$REQUIRED_NODE_MAJOR}
    local manager
    manager=$(detect_package_manager)

    if command -v node >/dev/null 2>&1; then
        local node_version node_major
        node_version=$(node -v | sed 's/^v//')
        node_major=${node_version%%.*}
        if [ "$node_major" -ge "$required_major" ]; then
            log "Node.js v${node_version} 已满足要求。"
            return 0
        fi
        warn "Node.js v${node_version} 低于 v${required_major}，准备升级。"
    else
        log "未检测到 Node.js，准备安装 Node.js ${required_major}。"
    fi

    case "$manager" in
        apt-get)
            curl -fsSL "https://deb.nodesource.com/setup_${required_major}.x" | sudo -E bash -
            sudo apt-get install -y nodejs
            ;;
        dnf|yum)
            curl -fsSL "https://rpm.nodesource.com/setup_${required_major}.x" | sudo bash -
            sudo "$manager" install -y nodejs
            ;;
        *)
            die "请手动安装 Node.js ${required_major} 后重试。"
            ;;
    esac
}

ensure_pm2() {
    if ! command -v pm2 >/dev/null 2>&1; then
        log "安装 PM2..."
        sudo npm install -g pm2
    fi
}

generate_prisma_client() {
    if [ -f "prisma/schema.prisma" ]; then
        log "生成 Prisma Client..."
        npx prisma generate --schema prisma/schema.prisma
    else
        warn "未找到 prisma/schema.prisma，跳过 Prisma Client 生成。"
    fi
}

install_project_dependencies() {
    log "安装项目依赖..."
    npm install
    generate_prisma_client
}

ensure_database_url() {
    [ -f ".env" ] || return 0
    if ! grep -q "^DATABASE_URL=" .env; then
        log "检测到 .env 缺少 DATABASE_URL，自动补齐。"
        printf '\n%s\n' "$DEFAULT_DATABASE_URL" >> .env
    fi
}

set_env_value() {
    local key="$1"
    local value="$2"
    local file="${3:-.env}"

    touch "$file"
    if grep -q "^${key}=" "$file"; then
        sed -i "s|^${key}=.*|${key}=${value}|g" "$file"
    else
        printf '%s=%s\n' "$key" "$value" >> "$file"
    fi
}

replace_custom_admin_path() {
    local admin_path="${1:-/beiadmin}"
    [ "$admin_path" != "/beiadmin" ] || return 0
    [ -d "dist" ] || return 0

    log "恢复自定义后台路径 (${admin_path})..."
    find dist -type f \( -name "*.js" -o -name "*.html" \) -exec sed -i "s|/beiadmin|${admin_path}|g" {} +
}

github_latest_release_json() {
    curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" || true
}

extract_latest_asset_url() {
    local release_json="$1"

    if command -v jq >/dev/null 2>&1; then
        echo "$release_json" | jq -r '.assets[]? | select(.name != null and (.name | test("think-class-(release|v[0-9.]+).*\\.zip$"))) | .browser_download_url' | head -n 1
    else
        echo "$release_json" | grep -o '"browser_download_url": *"[^"]*think-class-[^"]*\.zip"' | cut -d '"' -f 4 | head -n 1
    fi
}

extract_latest_tag() {
    local release_json="$1"

    if command -v jq >/dev/null 2>&1; then
        echo "$release_json" | jq -r '.tag_name // empty'
    else
        echo "$release_json" | grep -o '"tag_name": *"[^"]*"' | cut -d '"' -f 4 | head -n 1
    fi
}

download_release_zip() {
    local url="$1"
    local output="${2:-think-class-release.zip}"
    [ -n "$url" ] || return 1

    log "下载部署包..."
    curl -fL --retry 3 --retry-delay 2 -o "$output" "$url"
}

restart_pm2_service() {
    local app_name="${1:-$APP_NAME}"

    if pm2 show "$app_name" >/dev/null 2>&1; then
        log "重启 PM2 服务 ${app_name}..."
        pm2 restart "$app_name" --update-env
    else
        log "启动 PM2 服务 ${app_name}..."
        pm2 start npm --name "$app_name" -- run start
    fi

    pm2 save
}

get_pid_by_port() {
    local port="$1"
    local pid=""
    if command -v lsof >/dev/null 2>&1; then
        pid=$(lsof -t -iTCP:"$port" -sTCP:LISTEN 2>/dev/null | head -n 1 || true)
    fi
    if [ -z "$pid" ] && command -v ss >/dev/null 2>&1; then
        pid=$(ss -lntp 2>/dev/null | grep -E ":${port}[[:space:]]" | sed -n 's/.*pid=\([0-9]\+\).*/\1/p' | head -n 1 || true)
    fi
    echo "$pid"
}

is_port_in_use() {
    local port="$1"
    if command -v ss >/dev/null 2>&1; then
        ss -tuln 2>/dev/null | grep -q ":${port}[[:space:]]"
        return $?
    fi
    if command -v netstat >/dev/null 2>&1; then
        netstat -tuln 2>/dev/null | grep -q ":${port}[[:space:]]"
        return $?
    fi
    return 1
}

pick_available_port() {
    local start_port="$1"
    local max_tries="${2:-100}"
    local port="$start_port"
    local i=0

    while [ "$i" -lt "$max_tries" ]; do
        if ! is_port_in_use "$port"; then
            echo "$port"
            return 0
        fi
        port=$((port + 1))
        i=$((i + 1))
    done

    return 1
}

