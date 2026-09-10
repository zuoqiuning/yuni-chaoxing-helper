# ============================================================
# 屿宁学习助手 · 导出项目代码为 Markdown
# 输出: 项目根目录\项目代码.md
# ============================================================

# ---------- 编码设置（必须放最前）----------
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

# ---------- 防闪退：整个脚本包在 try/finally ----------
try {

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$out = Join-Path $root '项目代码.md'

# 排除规则
$excludeExt   = @('.md', '.log', '.tmp', '.bak', '.pem', '.zip', '.7z', '.rar')
$excludeDirs  = @('.git', 'node_modules', '.vscode', '.idea', 'dist', 'build', '__pycache__', '.cache')
$excludeFiles = @('.DS_Store', 'Thumbs.db', 'export.ps1', 'export.bat', 'desktop.ini', '项目代码.md')

function Test-Skip($item, $rootPath) {
    $rel = $item.FullName.Substring($rootPath.Length + 1)
    $parts = $rel -split '\\'
    foreach ($d in $excludeDirs) {
        if ($parts -contains $d) { return $true }
    }
    foreach ($f in $excludeFiles) {
        if ($item.Name -eq $f) { return $true }
    }
    if (-not $item.PSIsContainer) {
        if ($excludeExt -contains $item.Extension.ToLower()) { return $true }
    }
    return $false
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  屿宁学习助手 · 项目代码导出 (Markdown)" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  根目录: $root"
Write-Host "  输出到: $out"
Write-Host ""

# 收集文件
$allFiles = Get-ChildItem -Path $root -Recurse -File | Where-Object { -not (Test-Skip $_ $root) } | Sort-Object FullName
$allDirs  = Get-ChildItem -Path $root -Recurse -Directory | Where-Object { -not (Test-Skip $_ $root) }

Write-Host "  扫描到 $($allFiles.Count) 个文件, $($allDirs.Count) 个子目录" -ForegroundColor Yellow
Write-Host ""

$sb = [System.Text.StringBuilder]::new()
$nl = "`n"

# ---------- 头部 ----------
[void]$sb.Append("# 屿宁学习助手 · 项目代码$nl$nl")
[void]$sb.Append("> 导出时间: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $nl")
[void]$sb.Append("> 项目目录: ``$root``  $nl")
[void]$sb.Append("> 文件总数: $($allFiles.Count)$nl$nl")
[void]$sb.Append("---$nl$nl")

# ---------- 目录结构 ----------
[void]$sb.Append("## 目录结构$nl$nl")
[void]$sb.Append('```text' + $nl)

function Show-Tree {
    param($path, $prefix, $rootPath)
    $items = Get-ChildItem -Path $path | Where-Object { -not (Test-Skip $_ $rootPath) } | Sort-Object @{E={-not $_.PSIsContainer}}, Name
    $count = @($items).Count
    for ($i = 0; $i -lt $count; $i++) {
        $item = $items[$i]
        $last = ($i -eq $count - 1)
        $branch = if ($last) { '└── ' } else { '├── ' }
        $nextPrefix = if ($last) { $prefix + '    ' } else { $prefix + '│   ' }
        if ($item.PSIsContainer) {
            [void]$sb.Append("$prefix$branch$($item.Name)/$nl")
            Show-Tree -path $item.FullName -prefix $nextPrefix -rootPath $rootPath
        } else {
            [void]$sb.Append("$prefix$branch$($item.Name)$nl")
        }
    }
}

[void]$sb.Append("yuni-chaoxing-helper/$nl")
Show-Tree -path $root -prefix "" -rootPath $root

[void]$sb.Append('```' + $nl + $nl)

# ---------- 文件内容 ----------
[void]$sb.Append("## 文件内容$nl$nl")

foreach ($f in $allFiles) {
    $rel = $f.FullName.Substring($root.Length + 1) -replace '\\', '/'
    $ext = $f.Extension.TrimStart('.').ToLower()
    $lang = switch ($ext) {
        'js'   { 'javascript' }
        'json' { 'json' }
        'html' { 'html' }
        'css'  { 'css' }
        'bat'  { 'bat' }
        'ps1'  { 'powershell' }
        default { 'text' }
    }

    [void]$sb.Append("### $rel$nl$nl")
    [void]$sb.Append('```' + $lang + $nl)

    try {
        # ★ 强制用 UTF-8 读取源文件
        $content = [System.IO.File]::ReadAllText($f.FullName, [System.Text.UTF8Encoding]::new($false))
        if ($null -eq $content) { $content = '' }
        $content = $content -replace "`r`n", "`n"
        [void]$sb.Append($content)
        if (-not $content.EndsWith("`n")) { [void]$sb.Append($nl) }
    } catch {
        [void]$sb.Append("(读取失败: $($_.Exception.Message))$nl")
    }

    [void]$sb.Append('```' + $nl + $nl)
}

# ---------- 写文件（★ 带 BOM，Windows 记事本友好）----------
$utf8Bom = [System.Text.UTF8Encoding]::new($true)
[System.IO.File]::WriteAllText($out, $sb.ToString(), $utf8Bom)

$sizeKB = [math]::Round((Get-Item $out).Length / 1KB, 1)
Write-Host ""
Write-Host "✓ 导出完成" -ForegroundColor Green
Write-Host "  文件: $out"
Write-Host "  大小: $sizeKB KB"
Write-Host ""

} catch {
    Write-Host ""
    Write-Host "✗ 导出失败" -ForegroundColor Red
    Write-Host "  错误: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "  位置: $($_.InvocationInfo.PositionMessage)" -ForegroundColor Red
    Write-Host ""
}

# ---------- 防闪退：无论如何都等按键 ----------
Write-Host "按任意键退出..."
try {
    $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
} catch {
    Read-Host
}