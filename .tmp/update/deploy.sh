#!/bin/bash
set -e

echo "========================================================"
echo "🚀 学习王国 (Learning Kingdom) 极致一键部署脚本"
echo "🌐 目标域名: beiclass888.xyz"
echo "✨ 特性: 自动安装最新 Node.js 22.x, 清理冲突, 配置 Nginx"
echo "========================================================"

echo "📦 [1/7] 更新系统包并安装基础工具 (Nginx, Unzip, Curl)..."
sudo apt-get update -y
sudo apt-get install -y curl unzip nginx

echo "🛑 [2/7] 清理可能占用 80 端口的冲突服务 (OpenResty, Apache2)..."
sudo systemctl stop openresty apache2 2>/dev/null || true
sudo systemctl disable openresty apache2 2>/dev/null || true

echo "🟢 [3/7] 安装最新版 Node.js (v22.x)..."
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

echo "🛠️ [4/7] 全局安装守护进程 PM2 和执行器 tsx..."
sudo npm install -g pm2 tsx

echo "📂 [5/7] 安装项目运行依赖..."
npm install --production

echo "⚙️ [6/7] 启动全栈服务 (PM2)..."
pm2 delete all 2>/dev/null || true
pm2 start ecosystem.config.cjs --update-env
pm2 save
# 自动设置开机自启
env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u root --hp /root 2>/dev/null || true

echo "🌐 [7/7] 配置 Nginx 反向代理 (beiclass888.xyz)..."
cat > /etc/nginx/conf.d/beiclass888.xyz.conf << 'EOF'
server {
    listen 80;
    server_name beiclass888.xyz www.beiclass888.xyz;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

# 移除可能冲突的默认配置和旧配置
rm -f /etc/nginx/sites-enabled/default
rm -f /etc/nginx/sites-enabled/beiclass 2>/dev/null || true
rm -f /etc/nginx/sites-available/beiclass 2>/dev/null || true

# 重启 Nginx
sudo nginx -t
sudo systemctl enable nginx
sudo systemctl restart nginx

echo "========================================================"
echo "🎉 部署大功告成！"
echo "👉 请直接在浏览器访问: http://beiclass888.xyz/"
echo "========================================================"
