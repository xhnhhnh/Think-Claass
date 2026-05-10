#!/usr/bin/env bash
# Think-Class one-click release package builder.

set -Eeo pipefail
trap 'echo; echo "================================================="; echo "[错误] 打包脚本在第 $LINENO 行执行失败。"; echo "================================================="; exit 1' ERR

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/deploy-common.sh
source "$SCRIPT_DIR/scripts/deploy-common.sh"

RELEASE_DIR=${RELEASE_DIR:-release_build}
ZIP_NAME=${ZIP_NAME:-"${APP_NAME}-release.zip"}

build_frontend() {
    ensure_commands zip
    install_project_dependencies
    log "构建前端静态资源..."
    npm run build
}

prepare_release_dir() {
    log "整理发布目录 ${RELEASE_DIR}..."
    rm -rf "$RELEASE_DIR"
    mkdir -p "$RELEASE_DIR/scripts"

    cp -r dist "$RELEASE_DIR/"
    cp -r api "$RELEASE_DIR/"
    [ -d prisma ] && cp -r prisma "$RELEASE_DIR/"
    cp package.json package-lock.json tsconfig.json "$RELEASE_DIR/"
    cp install.sh update.sh "$RELEASE_DIR/"
    cp scripts/deploy-common.sh "$RELEASE_DIR/scripts/"

    if [ -f ".tmp/deploy/ecosystem.config.cjs" ]; then
        cp .tmp/deploy/ecosystem.config.cjs "$RELEASE_DIR/"
    fi
    if [ -f ".tmp/deploy/DEPLOYMENT.md" ]; then
        cp .tmp/deploy/DEPLOYMENT.md "$RELEASE_DIR/"
    fi
}

create_zip() {
    log "压缩生成 ${ZIP_NAME}..."
    rm -f "$ZIP_NAME"
    (cd "$RELEASE_DIR" && zip -r -q "../$ZIP_NAME" .)
}

cleanup() {
    rm -rf "$RELEASE_DIR"
}

main() {
    print_banner "Think-Class 一键打包"
    build_frontend
    prepare_release_dir
    create_zip
    cleanup
    print_banner "打包完成"
    echo "生成文件: ${ZIP_NAME}"
}

main "$@"

