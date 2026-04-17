<#
.SYNOPSIS
    学习王国 (Think-Class) Windows 自动化更新脚本
.DESCRIPTION
    此脚本用于在 Windows 环境下自动从 GitHub 下载最新 Release，
    解压并覆盖现有文件（自动保留 database.sqlite、.env 和 data 目录），
    然后执行 npm install 并通过 PM2 重启服务。
#>

$ErrorActionPreference = "Stop"
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$repo = "xhnhhnh/Think-Claass"
$appName = "think-class"
$zipFile = "think-class-release.zip"
$tempExtractDir = "temp_update_extract"
$requiredNodeMajor = 24
$defaultDatabaseUrl = 'DATABASE_URL="file:./database.sqlite"'

function Write-Log {
    param([string]$Message, [string]$Color = "White")
    Write-Host ">> $Message" -ForegroundColor $Color
}

function Test-NodeVersion {
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        Write-Log "错误：未检测到 Node.js，请先安装 Node.js 24 LTS 后再执行更新。" "Red"
        exit 1
    }

    $nodeVersion = (node -v).Trim().TrimStart("v")
    $nodeMajor = [int]($nodeVersion.Split(".")[0])
    if ($nodeMajor -lt $requiredNodeMajor) {
        Write-Log "错误：检测到 Node.js 版本 $nodeVersion，低于 v$requiredNodeMajor，无法继续更新。" "Red"
        Write-Log "请先升级到 Node.js 24 LTS，再重新运行 update.ps1。" "Red"
        exit 1
    }
}

function Invoke-GeneratePrismaClient {
    if (Test-Path "prisma/schema.prisma") {
        Write-Log "正在生成 Prisma Client (npx prisma generate)..." "Cyan"
        npx prisma generate --schema prisma/schema.prisma
    } else {
        Write-Log "未找到 prisma/schema.prisma，已跳过 Prisma Client 生成。" "Yellow"
    }
}

function Invoke-InstallDependencies {
    Write-Log "正在拉取最新的项目依赖 (npm install)..." "Cyan"
    npm install
    Invoke-GeneratePrismaClient
}

function Invoke-InstallDependenciesAndBuild {
    Invoke-InstallDependencies
    Write-Log "正在重新编译前端静态文件 (npm run build)..." "Cyan"
    npm run build
}

function Ensure-DatabaseUrl {
    if (-not (Test-Path ".env")) {
        return
    }
    $envContent = Get-Content ".env" -Raw
    if ($envContent -notmatch "(?m)^DATABASE_URL=") {
        Write-Log "检测到 .env 缺少 DATABASE_URL，正在自动补齐..." "Cyan"
        Add-Content -Path ".env" -Value "`n$defaultDatabaseUrl" -Encoding UTF8
    }
}

function Update-CurrentVersionInEnv {
    param([string]$Tag)
    if (-not (Test-Path ".env")) {
        return
    }
    $envContent = Get-Content ".env" -Raw
    if ($envContent -match "CURRENT_VERSION=") {
        $envContent = $envContent -replace "CURRENT_VERSION=.*", "CURRENT_VERSION=$Tag"
    } else {
        $envContent += "`nCURRENT_VERSION=$Tag"
    }
    Set-Content -Path ".env" -Value $envContent -Encoding UTF8
}

Write-Log "=================================================" "Cyan"
Write-Log "      欢迎使用【学习王国】Windows 自动更新脚本     " "Cyan"
Write-Log "=================================================" "Cyan"

# 1. 检查 PM2 服务状态
try {
    $pm2Status = pm2 show $appName *>&1
    if ($pm2Status -match "doesn't exist") {
        Write-Log "警告：未检测到运行中的 PM2 服务 '$appName'。" "Yellow"
        Write-Log "更新仍将继续，但最后可能需要您手动启动服务。" "Yellow"
    }
} catch {
    Write-Log "错误：未检测到 PM2，请确保您已全局安装 PM2 (npm install -g pm2)。" "Red"
    exit 1
}

Test-NodeVersion
Ensure-DatabaseUrl

# 2. 备份数据
$backupDir = "data_backup_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
Write-Log "正在备份数据到 $backupDir..." "Cyan"
if (Test-Path "data") {
    Copy-Item -Path "data" -Destination $backupDir -Recurse
    Write-Log "备份完成！" "Green"
} else {
    Write-Log "未检测到 data 目录，跳过备份。" "Yellow"
}

# 3. 获取 GitHub 最新版本信息
Write-Log "正在获取 GitHub 最新版本信息..." "Cyan"
try {
    $releaseInfo = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/releases/latest" -Method Get
    $downloadUrl = $releaseInfo.assets | Where-Object { $_.name -like "*think-class-release.zip" } | Select-Object -ExpandProperty browser_download_url
    $latestTag = $releaseInfo.tag_name

    if (-not $downloadUrl) {
        Write-Log "警告：无法在 GitHub Releases 中找到 think-class-release.zip 部署包。" "Yellow"
        Write-Log "将尝试使用本地源码拉取方式更新..." "Yellow"
        Invoke-InstallDependenciesAndBuild
    } else {
        Write-Log "发现最新版本: $latestTag" "Green"
        Write-Log "正在下载最新部署包..." "Cyan"
        Invoke-WebRequest -Uri $downloadUrl -OutFile $zipFile

        Write-Log "正在解压文件到临时目录..." "Cyan"
        if (Test-Path $tempExtractDir) { Remove-Item $tempExtractDir -Recurse -Force }
        Expand-Archive -Path $zipFile -DestinationPath $tempExtractDir -Force

        Write-Log "正在安全覆盖现有文件 (保留 .env 和 database.sqlite)..." "Cyan"
        # 移除临时目录中会覆盖用户数据的敏感文件
        $excludeItems = @(".env", "database.sqlite", "data")
        foreach ($item in $excludeItems) {
            $itemPath = Join-Path $tempExtractDir $item
            if (Test-Path $itemPath) {
                Remove-Item $itemPath -Recurse -Force
            }
        }

        # 复制文件覆盖当前目录
        Copy-Item -Path "$tempExtractDir\*" -Destination "." -Recurse -Force

        # 更新 .env 中的版本号
        Update-CurrentVersionInEnv -Tag $latestTag

        Write-Log "清理临时文件..." "Cyan"
        Remove-Item $zipFile -Force
        Remove-Item $tempExtractDir -Recurse -Force

        Invoke-InstallDependencies
    }
} catch {
    Write-Log "更新过程中发生网络错误或 API 限制: $_" "Red"
    exit 1
}

# 4. 处理自定义后台路径
$envPath = ".env"
if (Test-Path $envPath) {
    $adminPathLine = Select-String -Path $envPath -Pattern "^VITE_ADMIN_PATH=" | Select-Object -ExpandProperty Line
    if ($adminPathLine) {
        $adminPath = $adminPathLine.Split('=')[1].Trim()
        if ($adminPath -and $adminPath -ne "/beiadmin" -and (Test-Path "dist")) {
            Write-Log "正在恢复自定义后台路径 ($adminPath)..." "Cyan"
            Get-ChildItem -Path "dist" -Include "*.js", "*.html" -Recurse | ForEach-Object {
                $content = Get-Content $_.FullName -Raw
                $content = $content -replace "/beiadmin", $adminPath
                Set-Content -Path $_.FullName -Value $content -Encoding UTF8
            }
        }
    }
}

# 5. 重启服务
Write-Log "正在重启 Node.js 后端服务 (pm2 restart $appName)..." "Cyan"
try {
    pm2 restart $appName --update-env
    Write-Log "正在保存当前的 PM2 状态 (pm2 save)..." "Cyan"
    pm2 save
} catch {
    Write-Log "重启服务失败，请手动检查 PM2 状态。" "Yellow"
}

Write-Log "=================================================" "Green"
Write-Log " 🎉 更新并重启成功！" "Green"
Write-Log "=================================================" "Green"
Write-Log " 当前状态可以通过运行 'pm2 logs $appName' 查看运行日志。" "White"
Write-Log "=================================================" "Green"
