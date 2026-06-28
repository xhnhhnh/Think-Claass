#!/usr/bin/env bash
# Think-Class one-click update script.

set -Eeo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# shellcheck source=scripts/deploy-common.sh
source "$SCRIPT_DIR/scripts/deploy-common.sh"

BACKUP_ARCHIVE=""
LATEST_TAG=""
LOG_DIR=${UPDATE_LOG_DIR:-"$SCRIPT_DIR/logs"}
LOG_FILE=${UPDATE_LOG_FILE:-"$LOG_DIR/update.log"}
STATUS_FILE=${UPDATE_STATUS_FILE:-"$LOG_DIR/update-status.json"}
STARTED_AT=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
FAILURE_MESSAGE="更新失败，请查看日志。"
ROLLBACK_ATTEMPTED=0
UPDATE_COMPLETED=0

mkdir -p "$LOG_DIR"
touch "$LOG_FILE"
exec > >(tee -a "$LOG_FILE") 2>&1

json_escape() {
    printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g; s/\r//g'
}

read_current_version() {
    local version=""

    if [ -f ".env" ]; then
        version=$(grep "^CURRENT_VERSION=" .env | tail -n 1 | cut -d '=' -f 2- | tr -d '\r"' || true)
    fi

    if [ -z "$version" ] && [ -f "package.json" ]; then
        if command -v jq >/dev/null 2>&1; then
            version=$(jq -r '.version // empty' package.json)
        else
            version=$(grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' package.json | head -n 1 | cut -d '"' -f 4)
        fi
    fi

    echo "${version:-unknown}"
}

write_status() {
    local state="$1"
    local message="$2"
    local current_version="${3:-$(read_current_version)}"
    local latest_version="${4:-$LATEST_TAG}"
    local updated_at temp_file

    updated_at=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
    temp_file="${STATUS_FILE}.tmp.$$"
    cat > "$temp_file" <<JSON
{
  "state": "$(json_escape "$state")",
  "message": "$(json_escape "$message")",
  "currentVersion": "$(json_escape "$current_version")",
  "latestVersion": "$(json_escape "$latest_version")",
  "startedAt": "$(json_escape "$STARTED_AT")",
  "updatedAt": "$(json_escape "$updated_at")",
  "logFile": "$(json_escape "$LOG_FILE")",
  "platform": "linux",
  "pid": $$
}
JSON
    mv "$temp_file" "$STATUS_FILE"
}

on_error() {
    local exit_code=$?
    local line="$1"

    trap - ERR
    FAILURE_MESSAGE="更新失败，请查看日志中的第 ${line} 行附近输出。"
    warn "更新脚本在第 ${line} 行执行失败。"
    echo "================================================="
    exit "$exit_code"
}

on_exit() {
    local exit_code=$?

    if [ "$exit_code" -ne 0 ] && [ "$UPDATE_COMPLETED" -ne 1 ]; then
        set +e
        if [ "$ROLLBACK_ATTEMPTED" -ne 1 ] && [ -n "$BACKUP_ARCHIVE" ] && [ -f "$BACKUP_ARCHIVE" ]; then
            rollback
        fi
        write_status "failed" "$FAILURE_MESSAGE"
    fi
}

trap 'on_error "$LINENO"' ERR
trap on_exit EXIT

check_runtime() {
    command -v pm2 >/dev/null 2>&1 || die "未检测到 PM2，请先安装: npm install -g pm2"
    pm2 show "$APP_NAME" >/dev/null 2>&1 || die "未检测到运行中的 ${APP_NAME} 服务，请先执行 install.sh。"
    command -v node >/dev/null 2>&1 || die "未检测到 Node.js。"

    local node_version node_major
    node_version=$(node -v | sed 's/^v//')
    node_major=${node_version%%.*}
    [ "$node_major" -ge "$REQUIRED_NODE_MAJOR" ] || die "Node.js v${node_version} 低于 v${REQUIRED_NODE_MAJOR}。"
}

backup_data() {
    mkdir -p backups
    BACKUP_ARCHIVE="backups/backup_$(date +%Y%m%d_%H%M%S).tar.gz"
    log "备份当前应用到 ${BACKUP_ARCHIVE}..."
    tar -czf "$BACKUP_ARCHIVE" --exclude="backups" --exclude=".git" --exclude="node_modules" --exclude="logs" .
}

apply_latest_release() {
    log "获取 GitHub 最新 Release..."
    local release_json download_url
    release_json=$(github_latest_release_json)
    download_url=$(latest_release_download_url "$release_json")
    LATEST_TAG=$(extract_latest_tag "$release_json")
    if [ -z "$LATEST_TAG" ]; then
        LATEST_TAG=$(github_latest_tag_from_redirect)
    fi

    log "发现版本 ${LATEST_TAG:-未知}，开始更新。"
    write_status "running" "正在下载并应用 GitHub Release。" "$(read_current_version)" "$LATEST_TAG"
    download_release_zip "$download_url" think-class-release.zip
    unzip -o think-class-release.zip
    rm -f think-class-release.zip
    [ -n "$LATEST_TAG" ] && set_env_value CURRENT_VERSION "$LATEST_TAG"
    install_project_dependencies
}

restore_admin_path() {
    local admin_path="/beiadmin"
    if [ -f ".env" ] && grep -q "^VITE_ADMIN_PATH=" .env; then
        admin_path=$(grep "^VITE_ADMIN_PATH=" .env | tail -n 1 | cut -d '=' -f 2-)
    fi
    replace_custom_admin_path "${admin_path:-/beiadmin}"
}

rollback() {
    ROLLBACK_ATTEMPTED=1
    warn "更新失败，尝试从备份回滚。"
    if [ -n "$BACKUP_ARCHIVE" ] && [ -f "$BACKUP_ARCHIVE" ]; then
        tar -xzf "$BACKUP_ARCHIVE" -C .
        install_project_dependencies || true
        pm2 restart "$APP_NAME" --update-env || true
        warn "已尝试回滚，请检查 pm2 logs ${APP_NAME}。"
    else
        warn "找不到备份文件，无法自动回滚。"
    fi
}

restart_service() {
    pm2 restart "$APP_NAME" --update-env
    pm2 save
}

main() {
    print_banner "Think-Class 一键更新"
    log "更新日志将写入 ${LOG_FILE}。"
    write_status "running" "正在执行更新前检查。"
    check_runtime
    ensure_database_url
    ensure_commands curl unzip jq tar
    backup_data
    apply_latest_release
    restore_admin_path
    restart_service
    write_status "succeeded" "更新完成，服务已重启。" "$(read_current_version)" "$LATEST_TAG"
    UPDATE_COMPLETED=1
    print_banner "更新完成"
    echo "可运行 pm2 logs ${APP_NAME} 查看服务日志。"
    echo "更新日志: ${LOG_FILE}"
}

main "$@"

