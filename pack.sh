#!/bin/bash
# 学习王国 - 一键打包脚本

set -e
trap 'echo -e "\n========================================================"; echo -e "❌ [错误] 打包脚本在第 $LINENO 行执行失败！"; echo -e "========================================================\n"; exit 1' ERR

# --- 全局变量配置 ---
PROJECT_NAME=${PROJECT_NAME:-"Think-Class"}
APP_NAME=${APP_NAME:-"think-class"}
RELEASE_DIR="release_build"
ZIP_NAME="${APP_NAME}-release.zip"

# --- 打印欢迎信息 ---
print_welcome() {
    echo "========================================================"
    echo "📦 开始打包 ${PROJECT_NAME} 最新完整部署包"
    echo "========================================================"
}

# --- 编译前端代码 ---
build_frontend() {
    echo "🛠️ [1/4] 编译前端代码 (Vite Build)..."
    if ! npm run build; then
        echo "❌ [错误] 前端编译 (npm run build) 失败，请检查代码或依赖后重试。"
        exit 1
    fi
}

# --- 整理打包文件目录 ---
prepare_release_dir() {
    echo "📂 [2/4] 整理打包文件目录..."
    rm -rf "$RELEASE_DIR"
    mkdir -p "$RELEASE_DIR"

    # 拷贝核心代码
    cp -r dist "$RELEASE_DIR"/
    cp -r api "$RELEASE_DIR"/
    if [ -d prisma ]; then
        cp -r prisma "$RELEASE_DIR"/
    fi
    cp package.json "$RELEASE_DIR"/
    cp package-lock.json "$RELEASE_DIR"/
    cp tsconfig.json "$RELEASE_DIR"/

    # 拷贝部署所需的脚本和配置文件（从原来的临时目录中提取）
    cp .tmp/deploy/ecosystem.config.cjs "$RELEASE_DIR"/ 2>/dev/null || true
    cp .tmp/deploy/deploy.sh "$RELEASE_DIR"/ 2>/dev/null || true
    cp .tmp/deploy/update.sh "$RELEASE_DIR"/ 2>/dev/null || true
    cp .tmp/deploy/install.sh "$RELEASE_DIR"/ 2>/dev/null || true
    cp .tmp/deploy/DEPLOYMENT.md "$RELEASE_DIR"/ 2>/dev/null || true
}

# --- 压缩生成 zip 文件 ---
create_zip() {
    echo "🤐 [3/4] 压缩生成 zip 文件..."
    cd "$RELEASE_DIR"
    zip -r -q "../$ZIP_NAME" .
    cd ..
}

# --- 清理临时文件 ---
cleanup() {
    echo "🧹 [4/4] 清理临时文件..."
    rm -rf "$RELEASE_DIR"
}

# --- 打印成功信息 ---
print_success() {
    echo "========================================================"
    echo "🎉 打包大功告成！"
    echo "👉 生成文件: $ZIP_NAME"
    echo "========================================================"
}

# --- 主执行流程 ---
main() {
    print_welcome
    build_frontend
    prepare_release_dir
    create_zip
    cleanup
    print_success
}

main
