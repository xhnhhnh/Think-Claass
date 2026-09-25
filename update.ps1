<#
.SYNOPSIS
    Think-Class Windows one-click update script.
.DESCRIPTION
    Downloads the latest GitHub Release package when available, preserves local
    data, installs dependencies, generates Prisma Client and restarts PM2.
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

function Stop-WithMessage {
    param([string]$Message)
    Write-Log $Message "Red"
    exit 1
}

function Get-ReleaseAsset {
    param($ReleaseInfo)

    $asset = $ReleaseInfo.assets |
        Where-Object { $_.name -match "^think-class-(release|v[0-9.]+).+\.zip$" -or $_.name -eq "think-class-release.zip" } |
        Select-Object -First 1

    if ($asset) {
        return $asset.browser_download_url
    }

    return $null
}

function Get-ReleaseAssetUrl {
    param($ReleaseInfo, [string]$Name)

    $asset = $ReleaseInfo.assets | Where-Object { $_.name -eq $Name } | Select-Object -First 1
    if ($asset) {
        return $asset.browser_download_url
    }

    return $null
}

<#
    Fail closed, exactly like the Linux path (`verify_release_zip` in scripts/deploy-common.sh):
    a release without SHA256SUMS is a failed download, not a slow one.
#>
function Assert-ReleaseChecksum {
    param($ReleaseInfo, [string]$ZipPath, [string]$ZipName)

    $sumsUrl = Get-ReleaseAssetUrl -ReleaseInfo $ReleaseInfo -Name "SHA256SUMS"
    if (-not $sumsUrl) {
        Stop-WithMessage "The release has no SHA256SUMS asset; refusing to install an unverified package."
    }

    $sumsFile = "SHA256SUMS"
    Invoke-WebRequest -Uri $sumsUrl -OutFile $sumsFile

    $line = Get-Content $sumsFile | Where-Object { $_ -match [regex]::Escape($ZipName) } | Select-Object -First 1
    if (-not $line) {
        Stop-WithMessage "SHA256SUMS does not list $ZipName; refusing to install an unverified package."
    }

    $expected = ($line -split '\s+')[0].Trim().ToLower()
    $actual = (Get-FileHash -Path $ZipPath -Algorithm SHA256).Hash.ToLower()
    Remove-Item $sumsFile -Force -ErrorAction SilentlyContinue

    if ($expected -ne $actual) {
        Stop-WithMessage "Checksum mismatch for $ZipName (expected $expected, got $actual). The update was aborted."
    }

    Write-Log "Checksum verified: $actual" "Green"
}

function Test-NodeVersion {
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        Stop-WithMessage "Node.js was not found. Please install Node.js 24 LTS first."
    }

    $nodeVersion = (node -v).Trim().TrimStart("v")
    $nodeMajor = [int]($nodeVersion.Split(".")[0])
    if ($nodeMajor -lt $requiredNodeMajor) {
        Stop-WithMessage "Node.js $nodeVersion is too old. Please upgrade to Node.js 24 LTS."
    }
}

function Invoke-GeneratePrismaClient {
    if (Test-Path "prisma/schema.prisma") {
        Write-Log "Generating Prisma Client..." "Cyan"
        npx prisma generate --schema prisma/schema.prisma
    } else {
        Write-Log "prisma/schema.prisma was not found; skipping Prisma Client generation." "Yellow"
    }
}

function Invoke-InstallDependencies {
    Write-Log "Installing project dependencies..." "Cyan"
    npm install
    Invoke-GeneratePrismaClient
}

function Invoke-InstallDependenciesAndBuild {
    Invoke-InstallDependencies
    Write-Log "Building frontend assets..." "Cyan"
    npm run build
}

function Ensure-DatabaseUrl {
    if (-not (Test-Path ".env")) {
        return
    }

    $envContent = Get-Content ".env" -Raw
    if ($envContent -notmatch "(?m)^DATABASE_URL=") {
        Write-Log ".env is missing DATABASE_URL; adding the default SQLite URL." "Cyan"
        Add-Content -Path ".env" -Value "`n$defaultDatabaseUrl" -Encoding UTF8
    }
}

function Ensure-EncryptionKey {
    if (-not (Test-Path ".env")) {
        return
    }

    $envContent = Get-Content ".env" -Raw
    if ($envContent -match "(?m)^ENCRYPTION_KEY=") {
        return
    }

    Write-Log ".env is missing ENCRYPTION_KEY; generating one now. Back up .env: losing this key makes existing encrypted student names unreadable." "Yellow"
    $key = & node -e "process.stdout.write(require('node:crypto').randomBytes(16).toString('hex'))"
    Add-Content -Path ".env" -Value "`nENCRYPTION_KEY=$key" -Encoding UTF8
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

function Backup-LocalData {
    $backupDir = "backups\backup_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
    Write-Log "Backing up .env, database files and data directory to $backupDir..." "Cyan"
    New-Item -ItemType Directory -Path $backupDir -Force | Out-Null

    foreach ($item in @(".env", "database.sqlite", "database.sqlite-shm", "database.sqlite-wal", "data")) {
        if (Test-Path $item) {
            Copy-Item -Path $item -Destination $backupDir -Recurse -Force
        }
    }

    Write-Log "Backup complete." "Green"
}

<#
    `Restore-CustomAdminPath` used to rewrite dist/**/*.js|html for a custom console path. The path is
    runtime configuration now (ADMIN_PATH / VITE_ADMIN_PATH -> window.__TC_CONFIG__), and the helper it
    mirrored, `replace_custom_admin_path`, no longer exists in scripts/deploy-common.sh. Nothing
    replaces it on this platform either.
#>

function Restart-Service {
    Write-Log "Restarting PM2 service: $appName" "Cyan"
    try {
        pm2 restart $appName --update-env
        pm2 save
    } catch {
        Write-Log "PM2 restart failed. Please inspect the service manually." "Yellow"
    }
}

Write-Log "=================================================" "Cyan"
Write-Log "      Think-Class Windows one-click update        " "Cyan"
Write-Log "=================================================" "Cyan"

try {
    $pm2Status = pm2 show $appName *>&1
    if ($pm2Status -match "doesn't exist") {
        Write-Log "PM2 service '$appName' was not found. The update will continue." "Yellow"
    }
} catch {
    Stop-WithMessage "PM2 was not found. Install it first with: npm install -g pm2"
}

Test-NodeVersion
Ensure-DatabaseUrl
Ensure-EncryptionKey
Backup-LocalData

Write-Log "Fetching latest GitHub Release metadata..." "Cyan"
try {
    $releaseInfo = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/releases/latest" -Method Get
    $downloadUrl = Get-ReleaseAsset -ReleaseInfo $releaseInfo
    $latestTag = $releaseInfo.tag_name

    if (-not $downloadUrl) {
        Write-Log "No release package was found; rebuilding from local source." "Yellow"
        Invoke-InstallDependenciesAndBuild
    } else {
        Write-Log "Latest release: $latestTag" "Green"
        Write-Log "Downloading release package..." "Cyan"
        Invoke-WebRequest -Uri $downloadUrl -OutFile $zipFile
        Assert-ReleaseChecksum -ReleaseInfo $releaseInfo -ZipPath $zipFile -ZipName $zipFile

        Write-Log "Extracting package..." "Cyan"
        if (Test-Path $tempExtractDir) {
            Remove-Item $tempExtractDir -Recurse -Force
        }
        Expand-Archive -Path $zipFile -DestinationPath $tempExtractDir -Force

        Write-Log "Copying files while preserving local data..." "Cyan"
        foreach ($item in @(".env", "database.sqlite", "database.sqlite-shm", "database.sqlite-wal", "data", "backups")) {
            $itemPath = Join-Path $tempExtractDir $item
            if (Test-Path $itemPath) {
                Remove-Item $itemPath -Recurse -Force
            }
        }

        Copy-Item -Path "$tempExtractDir\*" -Destination "." -Recurse -Force
        Update-CurrentVersionInEnv -Tag $latestTag

        Remove-Item $zipFile -Force
        Remove-Item $tempExtractDir -Recurse -Force

        Invoke-InstallDependencies
    }
} catch {
    Stop-WithMessage "Update failed while fetching or applying the release: $_"
}

Restart-Service

Write-Log "=================================================" "Green"
Write-Log "Update complete." "Green"
Write-Log "Run 'pm2 logs $appName' to inspect service logs." "White"
Write-Log "=================================================" "Green"
