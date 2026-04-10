#!/bin/bash
# 学习王国 (Learning Kingdom) 更新后重启脚本

set -e
trap 'echo -e "\n========================================================"; echo -e "❌ [错误] 更新脚本在第 $LINENO 行执行失败！"; echo -e "========================================================\n"; exit 1' ERR

# --- 打印欢迎信息 ---
print_welcome() {
    echo "========================================================"
    echo "🚀 学习王国 (Learning Kingdom) 更新后重启脚本"
    echo "✨ 适用场景: 您已经手动解压并覆盖了最新代码"
    echo "⚠️  注意: 手动覆盖时，请千万不要覆盖 api/database.sqlite 数据库文件！"
    echo "========================================================"
}

# --- 检查并更新项目依赖 ---
update_dependencies() {
    echo "🔄 [1/2] 正在检查并更新项目依赖..."
    npm config set registry https://registry.npmmirror.com/
    npm install --production
}

# --- 重启 PM2 服务 ---
restart_service() {
    echo "⚙️ [2/2] 正在重启 PM2 服务以应用新代码..."
    pm2 restart ecosystem.config.cjs --update-env
    pm2 save
}

# --- 打印成功信息 ---
print_success() {
    echo "========================================================"
    echo "🎉 更新重启大功告成！"
    echo "所有最新功能已生效，您可以直接去浏览器刷新网页了！"
    echo "========================================================"
}

# --- 主执行流程 ---
main() {
    print_welcome
    update_dependencies
    restart_service
    print_success
}

main
