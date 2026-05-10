#!/usr/bin/env bash
# Think-Class one-click update script.

set -Eeo pipefail
trap 'echo; echo "================================================="; echo "[错误] 更新脚本在第 $LINENO 行执行失败。"; echo "================================================="; exit 1' ERR

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/deploy-common.sh
source "$SCRIPT_DIR/scripts/deploy-common.sh"

BACKUP_ARCHIVE=""
LATEST_TAG=""

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
    tar -czf "$BACKUP_ARCHIVE" --exclude="backups" --exclude=".git" --exclude="node_modules" .
}

apply_release_or_source_build() {
    log "获取 GitHub 最新 Release..."
    local release_json download_url
    release_json=$(github_latest_release_json)
    download_url=$(extract_latest_asset_url "$release_json")
    LATEST_TAG=$(extract_latest_tag "$release_json")

    if [ -z "$download_url" ]; then
        warn "未找到 Release 部署包，将使用当前源码重新构建。"
        install_project_dependencies
        npm run build
        return 0
    fi

    log "发现版本 ${LATEST_TAG:-未知}，开始更新。"
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
    if ! pm2 restart "$APP_NAME" --update-env; then
        rollback
        exit 1
    fi
    pm2 save
}

main() {
    print_banner "Think-Class 一键更新"
    check_runtime
    ensure_database_url
    ensure_commands curl unzip jq tar
    backup_data
    apply_release_or_source_build
    restore_admin_path
    restart_service
    print_banner "更新完成"
    echo "可运行 pm2 logs ${APP_NAME} 查看服务日志。"
}

main "$@"

