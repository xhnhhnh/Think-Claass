# 计划：使用 gh-cli 创建“所有的功能都可以在教室当中开关”需求 Issue

## 1. Summary（总结）
本计划旨在使用 GitHub CLI (`gh-cli`) 工具，在当前代码库 `Think-Claass` 的远端仓库中创建一个新的 Feature Request Issue。该 Issue 将记录用户提出的需求：“所有的功能（除超级管理员功能外）都可以在教室当中直接开关”。该需求旨在优化教师的课堂体验，使教师在授课过程中（例如在主控台、大屏或教学工具页面）能够快速开启或关闭各项功能（包括现有系统开关、教学工具开关及所有其他功能模块），而无需跳转到专门的功能开关页面。

## 2. Current State Analysis（当前状态分析）
- **功能现状**：目前，班级功能（如商品兑换、精灵系统、兑换记录等）需要在专门的 `/teacher/features`（功能开关）页面中进行管理。在教师上课时常用的“班级与学生管理”（Dashboard）、“教学工具”或“大屏展示”等页面中，并没有快捷的功能开关入口。
- **环境现状**：在当前的开发环境（非交互式沙盒）中，尚未安装 GitHub CLI (`gh`)，且未配置 `GH_TOKEN`，因此无法在无人值守的情况下自动完成 `gh` 的身份验证和 Issue 创建。

## 3. Proposed Changes（建议的变更）
由于沙盒环境的限制，实施步骤将分为以下几个环节：

### 步骤 1：撰写 Issue 详情文档
- **文件路径**：`/workspace/.trae/documents/issue-classroom-feature-toggles.md`
- **内容 (What/Why/How)**：
  - **What**：撰写详细的 Markdown 格式 Issue 内容，描述“所有的功能都可以在教室当中开关”的需求背景、目标（涵盖现有系统开关、教学工具开关及所有非超管功能模块）以及预期的验收标准。
  - **Why**：作为 `gh issue create --body-file` 的输入源，确保 Issue 描述清晰、排版规范。
  - **How**：在执行阶段，我将使用文件写入工具生成此文档。

### 步骤 2：生成一键安装与创建的脚本
- **文件路径**：`/workspace/.trae/documents/create-issue.sh`
- **内容 (What/Why/How)**：
  - **What**：编写一个 Bash 脚本，包含以下逻辑：
    1. 检测 `gh` 是否安装，若未安装则自动下载并安装 GitHub CLI。
    2. 提示用户进行 `gh auth login`（若未登录）。
    3. 调用 `gh issue create --title "Feature: 所有的功能都可以在教室当中开关" --body-file .trae/documents/issue-classroom-feature-toggles.md --label "enhancement"`。
  - **Why**：方便用户在自己的终端中交互式执行，解决我们在非交互式沙盒中无法进行网页/设备代码登录的问题。
  - **How**：参考 `gh-cli` 的官方安装命令和 Issue 创建指令编写该脚本。

## 4. Assumptions & Decisions（假设与决策）
- **决策**：决定不在沙盒的后台直接强行执行 `gh auth login`，因为这需要打开浏览器或者输入设备验证码，这在当前自动化环境中不可行。
- **假设**：用户在本地终端或有交互能力的终端中执行该脚本时，能够顺利完成 GitHub 的授权登录并创建该 Issue。
- **假设**：需求中指的“所有功能”包含了 `src/pages/Teacher/Features.tsx` 中控制的内容，以及其他需要在课堂中临时切换状态的功能（例如倒计时、点名等教学工具的入口开关）。

## 5. Verification steps（验证步骤）
1. 检查 `/workspace/.trae/documents/issue-classroom-feature-toggles.md` 是否已正确生成且内容完整。
2. 检查 `/workspace/.trae/documents/create-issue.sh` 脚本是否具备可执行权限（`chmod +x`），且内部 `gh` 命令参数无误。
3. 执行完成后，指导用户如何在本地运行该脚本，并在脚本执行成功后使用 `gh issue view` 或在浏览器中查看新生成的 Issue。