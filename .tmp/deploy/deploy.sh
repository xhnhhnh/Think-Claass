#!/bin/bash
# 学习王国 (Learning Kingdom) 极致一键部署脚本

set -e
trap 'echo -e "\n========================================================"; echo -e "❌ [错误] 部署脚本在第 $LINENO 行执行失败！"; echo -e "========================================================\n"; exit 1' ERR

# --- 全局变量配置 ---
DOMAIN="beiclass888.xyz"

# --- 打印欢迎信息 ---
print_welcome() {
    echo "========================================================"
    echo "🚀 学习王国 (Learning Kingdom) 极致一键部署脚本"
    echo "🌐 目标域名: $DOMAIN"
    echo "✨ 特性: 自动安装最新 Node.js 22.x, 清理冲突, 配置 Nginx"
    echo "========================================================"
}

# --- 更新系统包并安装基础工具 ---
install_base_tools() {
    echo "📦 [1/7] 更新系统包并安装基础工具 (Nginx, Unzip, Curl)..."
    sudo apt-get update -y
    sudo apt-get install -y curl unzip nginx
}

# --- 清理可能占用 80 端口的冲突服务 ---
clean_conflicts() {
    echo "🛑 [2/7] 清理可能占用 80 端口的冲突服务 (OpenResty, Apache2)..."
    sudo systemctl stop openresty apache2 2>/dev/null || true
    sudo systemctl disable openresty apache2 2>/dev/null || true
}

# --- 安装最新版 Node.js ---
install_nodejs() {
    echo "🟢 [3/7] 安装最新版 Node.js (v22.x)..."
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    sudo apt-get install -y nodejs
}

# --- 全局安装 PM2 和 tsx ---
install_global_npm_packages() {
    echo "🛠️ [4/7] 全局安装守护进程 PM2 和执行器 tsx..."
    sudo npm install -g pm2 tsx
}

# --- 安装项目运行依赖 ---
install_project_deps() {
    echo "📂 [5/7] 安装项目运行依赖..."
    npm install --production
}

# --- 启动全栈服务 ---
start_pm2_service() {
    echo "⚙️ [6/7] 启动全栈服务 (PM2)..."
    pm2 delete all 2>/dev/null || true
    pm2 start ecosystem.config.cjs --update-env
    pm2 save
    
    # 自动设置开机自启
    env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u root --hp /root 2>/dev/null || true
}

# --- 配置 Nginx 反向代理 ---
configure_nginx() {
    echo "🌐 [7/7] 配置 Nginx 反向代理 ($DOMAIN)..."
    cat > /etc/nginx/conf.d/$DOMAIN.conf << NGINX_EOF
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
NGINX_EOF

    # 移除可能冲突的默认配置和旧配置
    rm -f /etc/nginx/sites-enabled/default
    rm -f /etc/nginx/sites-enabled/beiclass 2>/dev/null || true
    rm -f /etc/nginx/sites-available/beiclass 2>/dev/null || true

    # 重启 Nginx
    sudo nginx -t
    sudo systemctl enable nginx
    sudo systemctl restart nginx
}

# --- 打印成功信息 ---
print_success() {
    echo "========================================================"
    echo "🎉 部署大功告成！"
    echo "👉 请直接在浏览器访问: http://$DOMAIN/"
    echo "========================================================"
}

# --- 主执行流程 ---
main() {
    print_welcome
    install_base_tools
    clean_conflicts
    install_nodejs
    install_global_npm_packages
    install_project_deps
    start_pm2_service
    configure_nginx
    print_success
}

main
