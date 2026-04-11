#!/bin/bash
# 学习王国 - 一键自动更新脚本
# 支持 Ubuntu/Debian/CentOS 系统

set -e
trap 'echo -e "\n================================================="; echo -e "[错误] 更新脚本在第 $LINENO 行执行失败！"; echo -e "=================================================\n"; exit 1' ERR

# --- 全局变量配置 ---
PROJECT_NAME=${PROJECT_NAME:-"Think-Class"}
APP_NAME=${APP_NAME:-"think-class"}
REPO="xhnhhnh/Think-Claass"
BACKUP_ARCHIVE=""

# --- 打印欢迎信息 ---
print_welcome() {
    echo "================================================="
    echo "      欢迎使用【${PROJECT_NAME}】一键自动更新脚本       "
    echo "================================================="
}

# --- 检查服务状态 ---
check_pm2_service() {
    if ! pm2 show $APP_NAME &> /dev/null; then
        echo ">> 错误：未检测到运行中的 '${APP_NAME}' 服务。请先运行 install.sh 安装。"
        exit 1
    fi
}

# --- 检查 Node.js 版本 ---
check_node_version() {
    if ! command -v node &> /dev/null; then
        echo ">> 错误：未检测到 Node.js。请先安装 Node.js 24 LTS 后再执行更新。"
        exit 1
    fi

    NODE_VERSION=$(node -v | cut -d 'v' -f 2)
    NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d '.' -f 1)
    if [ "$NODE_MAJOR" -lt 24 ]; then
        echo ">> 错误：检测到 Node.js 版本 ($NODE_VERSION) 低于 v24，无法继续更新。"
        echo ">> 请先升级到 Node.js 24 LTS，再重新运行 update.sh。"
        exit 1
    fi
}

# --- 检查并安装基础工具 ---
install_base_tools() {
    echo ">> 检查基础工具 (curl, unzip, jq, tar)..."
    local tools_to_install=""
    
    if ! command -v curl &> /dev/null; then
        tools_to_install="$tools_to_install curl"
    fi
    if ! command -v unzip &> /dev/null; then
        tools_to_install="$tools_to_install unzip"
    fi
    if ! command -v jq &> /dev/null; then
        tools_to_install="$tools_to_install jq"
    fi
    if ! command -v tar &> /dev/null; then
        tools_to_install="$tools_to_install tar"
    fi
    
    if [ -n "$tools_to_install" ]; then
        echo ">> 正在安装缺少的基础工具:$tools_to_install"
        if command -v apt-get &> /dev/null; then
            sudo apt-get update && sudo apt-get install -y $tools_to_install
        elif command -v yum &> /dev/null; then
            sudo yum install -y $tools_to_install
        elif command -v dnf &> /dev/null; then
            sudo dnf install -y $tools_to_install
        fi
    fi
}

# --- 备份数据 ---
backup_data() {
    mkdir -p backups
    BACKUP_ARCHIVE="backups/backup_$(date +%Y%m%d_%H%M%S).tar.gz"
    echo ">> 正在备份整个应用程序和数据库到 $BACKUP_ARCHIVE (压缩并排除 node_modules 以节省空间)..."
    
    if tar -czf "$BACKUP_ARCHIVE" --exclude="backups" --exclude=".git" --exclude="node_modules" .; then
        echo ">> 备份完成！"
    else
        echo ">> [错误] 备份失败！请检查磁盘空间或权限。"
        exit 1
    fi
}

# --- 获取并更新最新版本 ---
update_project() {
    echo ">> 正在获取 GitHub 最新版本信息..."
    LATEST_RELEASE=$(curl -s "https://api.github.com/repos/${REPO}/releases/latest")
    
    # 检查是否触及 API 速率限制
    if command -v jq &> /dev/null; then
        RATE_LIMIT_MSG=$(echo "$LATEST_RELEASE" | jq -r '.message // empty')
        if [[ "$RATE_LIMIT_MSG" == *"API rate limit exceeded"* ]]; then
            echo ">> [错误] GitHub API 速率限制超限！"
            LATEST_RELEASE=""
        fi
    else
        if echo "$LATEST_RELEASE" | grep -q "API rate limit exceeded"; then
            echo ">> [错误] GitHub API 速率限制超限！"
            LATEST_RELEASE=""
        fi
    fi

    if [ -n "$LATEST_RELEASE" ]; then
        if command -v jq &> /dev/null; then
            DOWNLOAD_URL=$(echo "$LATEST_RELEASE" | jq -r '.assets[]? | select(.name != null and (.name | contains("think-class")) and (.name | endswith(".zip"))) | .browser_download_url' | head -n 1)
            LATEST_TAG=$(echo "$LATEST_RELEASE" | jq -r '.tag_name // empty')
        else
            DOWNLOAD_URL=$(echo "$LATEST_RELEASE" | grep -o '"browser_download_url": *"[^"]*think-class-.*\.zip"' | cut -d '"' -f 4 | head -n 1)
            LATEST_TAG=$(echo "$LATEST_RELEASE" | grep -o '"tag_name": *"[^"]*"' | cut -d '"' -f 4)
        fi
    else
        DOWNLOAD_URL=""
        LATEST_TAG=""
    fi

    if [ -z "$DOWNLOAD_URL" ]; then
        echo ">> [警告] 无法在 GitHub Releases 中获取下载链接（可能由于速率限制或未发布）。"
        echo ">> 将尝试使用 npm run build 进行本地源码更新..."
        echo ">> 正在拉取最新的项目依赖 (npm install)..."
        npm install
        if [ -f "prisma/schema.prisma" ]; then
            echo ">> 正在生成 Prisma Client (npx prisma generate)..."
            npx prisma generate --schema prisma/schema.prisma
        else
            echo ">> [警告] 未找到 prisma/schema.prisma，已跳过 Prisma Client 生成。"
        fi
        echo ">> 正在重新编译前端静态文件 (npm run build)..."
        npm run build
    else
        echo ">> 发现最新版本: $LATEST_TAG"
        echo ">> 正在下载最新部署包..."
        curl -L -o think-class-release.zip "$DOWNLOAD_URL"
        
        echo ">> 正在解压并覆盖现有文件 (保留 .env 和 backups)..."
        unzip -o think-class-release.zip
        rm think-class-release.zip

        # 更新 .env 中的版本号
        if grep -q "CURRENT_VERSION=" .env; then
            sed -i "s/CURRENT_VERSION=.*/CURRENT_VERSION=$LATEST_TAG/g" .env
        else
            echo "CURRENT_VERSION=$LATEST_TAG" >> .env
        fi

        echo ">> 正在拉取最新的项目依赖 (npm install)..."
        npm install
        if [ -f "prisma/schema.prisma" ]; then
            echo ">> 正在生成 Prisma Client (npx prisma generate)..."
            npx prisma generate --schema prisma/schema.prisma
        else
            echo ">> [警告] 未找到 prisma/schema.prisma，已跳过 Prisma Client 生成。"
        fi
    fi
}

# --- 处理自定义后台路径 ---
process_custom_admin_path() {
    local ADMIN_PATH=$(grep VITE_ADMIN_PATH .env | cut -d '=' -f2)
    ADMIN_PATH=${ADMIN_PATH:-/beiadmin}
    
    if [ "$ADMIN_PATH" != "/beiadmin" ] && [ -d "dist" ]; then
        echo ">> 正在恢复自定义后台路径 ($ADMIN_PATH)..."
        find dist -type f \( -name "*.js" -o -name "*.html" \) -exec sed -i "s|/beiadmin|$ADMIN_PATH|g" {} +
    fi
}

# --- 回滚机制 ---
rollback() {
    echo ">> 正在执行回滚操作，恢复备份文件: $BACKUP_ARCHIVE ..."
    if [ -n "$BACKUP_ARCHIVE" ] && [ -f "$BACKUP_ARCHIVE" ]; then
        echo ">> 正在解压备份文件以覆盖当前内容..."
        tar -xzf "$BACKUP_ARCHIVE" -C .
        
        echo ">> 正在重新拉取旧版本的依赖 (npm install)..."
        npm install
        if [ -f "prisma/schema.prisma" ]; then
            echo ">> 正在生成 Prisma Client (npx prisma generate)..."
            npx prisma generate --schema prisma/schema.prisma
        else
            echo ">> [警告] 未找到 prisma/schema.prisma，已跳过 Prisma Client 生成。"
        fi
        
        echo ">> 备份已恢复，尝试重启服务..."
        if ! pm2 restart $APP_NAME --update-env; then
            echo ">> [致命错误] 回滚后服务重启仍然失败！请手动排查。"
        else
            echo ">> 回滚成功，服务已恢复到更新前状态。"
        fi
    else
        echo ">> [错误] 找不到备份文件，无法执行回滚！"
    fi
}

# --- 重启 PM2 服务 ---
restart_service() {
    echo ">> 正在重启 Node.js 后端服务 (pm2 restart $APP_NAME)..."
    if ! pm2 restart $APP_NAME --update-env; then
        echo ">> [错误] PM2 重启服务失败！正在启动回滚机制..."
        rollback
        exit 1
    fi

    echo ">> 正在保存当前的 PM2 状态 (pm2 save)..."
    pm2 save
}

# --- 打印成功信息 ---
print_success() {
    echo "================================================="
    echo " 🎉 更新并重启成功！"
    echo "================================================="
    echo " 当前状态可以通过运行 'pm2 logs $APP_NAME' 查看运行日志。"
    echo "================================================="
}

# --- 主执行流程 ---
main() {
    print_welcome
    check_pm2_service
    check_node_version
    install_base_tools
    backup_data
    update_project
    process_custom_admin_path
    restart_service
    print_success
}

main
