#!/bin/bash

# 颜色定义
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}>>> 检查并配置 GitHub CLI (gh)...${NC}"

# 1. 检查是否安装了 gh
if ! command -v gh &> /dev/null; then
    echo -e "${YELLOW}未检测到 GitHub CLI (gh)。正在为您安装...${NC}"
    # 根据操作系统类型进行安装
    if [ -f /etc/debian_version ]; then
        curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
        echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
        sudo apt update
        sudo apt install gh -y
    elif [ -f /etc/redhat-release ]; then
        sudo dnf install 'dnf-command(config-manager)'
        sudo dnf config-manager --add-repo https://cli.github.com/packages/rpm/gh-cli.repo
        sudo dnf install gh -y
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        brew install gh
    else
        echo -e "${RED}无法自动检测到受支持的包管理器，请手动安装 GitHub CLI：https://cli.github.com/${NC}"
        exit 1
    fi
    echo -e "${GREEN}GitHub CLI 安装完成！${NC}"
else
    echo -e "${GREEN}检测到 GitHub CLI (gh) 已安装！${NC}"
fi

# 2. 检查是否已登录
if ! gh auth status &> /dev/null; then
    echo -e "${YELLOW}您尚未登录 GitHub。即将启动交互式登录过程，请根据提示完成授权...${NC}"
    gh auth login
    
    # 再次检查登录状态
    if ! gh auth status &> /dev/null; then
        echo -e "${RED}登录失败或被取消。无法创建 Issue。${NC}"
        exit 1
    fi
fi

echo -e "${GREEN}GitHub 授权验证通过！${NC}"

# 3. 创建 Issue
echo -e "${BLUE}>>> 正在为您创建 Issue...${NC}"

# 确保在项目根目录运行
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
cd "$PROJECT_ROOT" || exit 1

ISSUE_FILE=".trae/documents/issue-classroom-feature-toggles.md"

if [ ! -f "$ISSUE_FILE" ]; then
    echo -e "${RED}错误：找不到 Issue 详情文档 $ISSUE_FILE${NC}"
    exit 1
fi

gh issue create \
    --title "Feature: 所有的功能都可以在教室当中开关" \
    --body-file "$ISSUE_FILE" \
    --label "enhancement"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}🎉 成功！Issue 创建完成。您可以使用 'gh issue list' 查看最新的 Issue。${NC}"
else
    echo -e "${RED}❌ Issue 创建失败，请检查上方错误信息。${NC}"
fi
