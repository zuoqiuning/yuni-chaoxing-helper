# ============================================================================
# 屿宁学习助手 · 一键发布脚本
# 用法：cd D:\Desktop\yuni-chaoxing-helper; .\release.ps1
# ============================================================================

$ErrorActionPreference = "Continue"

# ============ 配置 ============
$ver        = "0.4.0"
$projectDir = "D:\Desktop\yuni-chaoxing-helper"
$zipPath    = "D:\Desktop\yuni-chaoxing-helper-v$ver.zip"
$tag        = "v$ver"

$giteeOwner  = "zuoqiuning"
$giteeRepo   = "yuni-chaoxing-helper"
$githubOwner = "zuoqiuning"
$githubRepo  = "yuni-chaoxing-helper"

$githubToken = $env:GITHUB_TOKEN
$giteeToken  = $env:GITEE_TOKEN

# ============ 发行描述 ============
$releaseTitle = "屿宁学习助手 v$ver"

$releaseBody = @'
## 屿宁学习助手 v{0}

本次更新聚焦 **界面重构、稳定性提升和扫描性能优化**。

### 修复
- AI 答案索引错位 —— 改用 `find` 显式匹配 `index`
- JSON 解析健壮性 —— 括号配平解析替代贪婪正则
- 配置字段残留 —— 读取 / 保存做白名单过滤
- rate hook 定时器泄漏 —— video 卸载后自动清理

### 优化
- pause guard 延迟 200ms → 800ms，加 3 秒冷却，避免和 videojs 状态对撞
- 扫描轮数 2 → 1，大幅减少超星 iframe 反复懒加载

### 界面
- 拆分 sidepanel.css 为 5 个模块（base / layout / components / log / modal）
- 移除重复标题栏，状态点 / 刷新 / 设置合并到 AI banner 右侧
- 卡片化布局，各区域独立滚动（不再整体滚动）
- 移除顶部进度条
- 日志固定 170px 高度，可展开全屏查看
- AI 答题卡片重做：一键答题按钮 + 题目详情弹窗
- 应用 CSS 变量，统一圆角 / 阴影 / 过渡
'@ -f $ver

# ============ 预检查 ============
Write-Host "`n========== 屿宁学习助手 · 发布 v$ver ==========" -ForegroundColor Magenta

if (-not $githubToken) { Write-Host "⚠ 未设置 GITHUB_TOKEN，将跳过 GitHub Release" -ForegroundColor Yellow }
if (-not $giteeToken)  { Write-Host "⚠ 未设置 GITEE_TOKEN，将跳过 Gitee Release"  -ForegroundColor Yellow }

Set-Location $projectDir

# ============ 1. Git 提交推送 ============
Write-Host "`n[1/5] 提交代码 → Gitee + GitHub..." -ForegroundColor Cyan

git add -A
git commit -m "chore: 发布 $tag" -m "界面重构 + 稳定性优化 + 扫描性能优化" 2>&1 | Out-Host

git push origin main 2>&1 | Out-Host

# ============ 2. 打 tag 并推送 ============
Write-Host "`n[2/5] 创建并推送 tag $tag..." -ForegroundColor Cyan

$existingTag = git tag -l $tag
if ($existingTag) {
  Write-Host "  tag $tag 已存在，跳过创建" -ForegroundColor Yellow
} else {
  git tag $tag
  Write-Host "  ✓ tag $tag 已创建" -ForegroundColor Green
}
git push origin $tag 2>&1 | Out-Host

# ============ 3. 打包 zip ============
Write-Host "`n[3/5] 打包 zip..." -ForegroundColor Cyan

if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

$tmpDir = Join-Path $env:TEMP "yuni-pack-$([Guid]::NewGuid().ToString('N'))"
New-Item -ItemType Directory -Path $tmpDir | Out-Null

$files = git ls-files
foreach ($f in $files) {
  if (Test-Path $f) {
    $dest    = Join-Path $tmpDir $f
    $destDir = Split-Path $dest -Parent
    if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }
    Copy-Item $f -Destination $dest -Force
  }
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($tmpDir, $zipPath)
Remove-Item $tmpDir -Recurse -Force

$zipSize = "{0:N1} KB" -f ((Get-Item $zipPath).Length / 1KB)
Write-Host "  ✓ 已生成: $zipPath ($zipSize)" -ForegroundColor Green

# ============ 4. GitHub Release ============
if ($githubToken) {
  Write-Host "`n[4/5] 创建 GitHub Release..." -ForegroundColor Cyan
  try {
    $ghBody = @{
      tag_name   = $tag
      name       = $releaseTitle
      body       = $releaseBody
      draft      = $false
      prerelease = $false
    } | ConvertTo-Json -Depth 3

    $ghRelease = Invoke-RestMethod `
      -Uri "https://api.github.com/repos/$githubOwner/$githubRepo/releases" `
      -Method Post `
      -Headers @{ Authorization = "token $githubToken"; "User-Agent" = "PowerShell" } `
      -ContentType "application/json; charset=utf-8" `
      -Body ([System.Text.Encoding]::UTF8.GetBytes($ghBody))

    Write-Host "  ✓ Release 已创建 (id=$($ghRelease.id))" -ForegroundColor Green

    # 上传 zip
    $zipName   = Split-Path $zipPath -Leaf
    $uploadUrl = "https://uploads.github.com/repos/$githubOwner/$githubRepo/releases/$($ghRelease.id)/assets?name=$zipName"

    Invoke-RestMethod `
      -Uri $uploadUrl `
      -Method Post `
      -Headers @{
        Authorization  = "token $githubToken"
        "User-Agent"   = "PowerShell"
        "Content-Type" = "application/zip"
      } `
      -InFile $zipPath | Out-Null

    Write-Host "  ✓ zip 已上传到 GitHub Release" -ForegroundColor Green
  } catch {
    Write-Host "  ✗ GitHub Release 失败: $($_.Exception.Message)" -ForegroundColor Red
  }
} else {
  Write-Host "`n[4/5] 跳过 GitHub Release（未设置 GITHUB_TOKEN）" -ForegroundColor Yellow
}

# ============ 5. Gitee Release ============
if ($giteeToken) {
  Write-Host "`n[5/5] 创建 Gitee Release..." -ForegroundColor Cyan
  try {
    # 手动构造 urlencoded body（保证中文 UTF-8 编码）
    $formData = @{
      access_token     = $giteeToken
      tag_name         = $tag
      name             = $releaseTitle
      body             = $releaseBody
      target_commitish = "main"
    }
    $encodedBody = ($formData.GetEnumerator() | ForEach-Object {
      "$([System.Uri]::EscapeDataString($_.Key))=$([System.Uri]::EscapeDataString([string]$_.Value))"
    }) -join "&"

    $giteeRelease = Invoke-RestMethod `
      -Uri "https://gitee.com/api/v5/repos/$giteeOwner/$giteeRepo/releases" `
      -Method Post `
      -ContentType "application/x-www-form-urlencoded; charset=utf-8" `
      -Body ([System.Text.Encoding]::UTF8.GetBytes($encodedBody))

    Write-Host "  ✓ Release 已创建 (id=$($giteeRelease.id))" -ForegroundColor Green

    # 上传附件（用 curl.exe 走 multipart）
    $giteeUploadUrl = "https://gitee.com/api/v5/repos/$giteeOwner/$giteeRepo/releases/$($giteeRelease.id)/attach_files"

    & curl.exe -sS -X POST $giteeUploadUrl `
      -F "access_token=$giteeToken" `
      -F "file=@$zipPath" | Out-Null

    Write-Host "  ✓ zip 已上传到 Gitee Release" -ForegroundColor Green
  } catch {
    Write-Host "  ✗ Gitee Release 失败: $($_.Exception.Message)" -ForegroundColor Red
  }
} else {
  Write-Host "`n[5/5] 跳过 Gitee Release（未设置 GITEE_TOKEN）" -ForegroundColor Yellow
}

# ============ 完成 ============
Write-Host "`n========== 全部完成 ==========" -ForegroundColor Green
Write-Host "Gitee:  https://gitee.com/$giteeOwner/$giteeRepo/releases/tag/$tag"
Write-Host "GitHub: https://github.com/$githubOwner/$githubRepo/releases/tag/$tag"
Write-Host "zip:    $zipPath"