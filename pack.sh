#!/bin/bash
set -e

PROJECT_NAME=${PROJECT_NAME:-"Think-Class"}
APP_NAME=${APP_NAME:-"think-class"}

echo "========================================================"
echo "📦 开始打包 ${PROJECT_NAME} 最新完整部署包"
echo "========================================================"

echo "🛠️ [1/4] 编译前端代码 (Vite Build)..."
npm run build

echo "📂 [2/4] 整理打包文件目录..."
rm -rf release_build
mkdir -p release_build

# 拷贝核心代码
cp -r dist release_build/
cp -r api release_build/
cp package.json release_build/
cp package-lock.json release_build/
cp tsconfig.json release_build/

# 拷贝部署所需的脚本和配置文件（从原来的临时目录中提取）
cp .tmp/deploy/ecosystem.config.cjs release_build/ 2>/dev/null || true
cp .tmp/deploy/deploy.sh release_build/ 2>/dev/null || true
cp .tmp/deploy/update.sh release_build/ 2>/dev/null || true
cp .tmp/deploy/DEPLOYMENT.md release_build/ 2>/dev/null || true

echo "🤐 [3/4] 压缩生成 zip 文件..."
cd release_build
zip -r -q ../${APP_NAME}-release.zip .
cd ..

echo "🧹 [4/4] 清理临时文件..."
rm -rf release_build

echo "========================================================"
echo "🎉 打包大功告成！"
echo "👉 生成文件: ${APP_NAME}-release.zip"
echo "========================================================"
