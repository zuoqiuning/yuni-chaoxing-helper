# ============================================================
# 屿宁学习助手 · 一键推送到 Gitee
# ============================================================

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

try {
    $ErrorActionPreference = 'Stop'

    $root = Split-Path -Parent $MyInvocation.MyCommand.Path
    Set-Location $root

    # ---------- 配置区（改这里）----------
    $giteeUser = 'zuoqiuning'
    $repoName  = 'yuni-chaoxing-helper'
    $branch    = 'main'
    # ------------------------------------

    $remoteUrl = "https://gitee.com/$giteeUser/$repoName.git"

    Write-Host ""
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host "  屿宁学习助手 · 推送到 Gitee" -ForegroundColor Cyan
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host "  仓库: $remoteUrl"
    Write-Host "  分支: $branch"
    Write-Host ""

    # ---------- 检查 git ----------
    $gitVersion = git --version 2>$null
    if (-not $gitVersion) {
        throw "未检测到 Git，请先安装：https://git-scm.com/download/win"
    }
    Write-Host "  ✓ $gitVersion" -ForegroundColor Green

    # ---------- 检查 git 用户配置 ----------
    $userName = git config user.name 2>$null
    $userEmail = git config user.email 2>$null
    if (-not $userName) {
        Write-Host "  ! 未配置 git user.name" -ForegroundColor Yellow
        $userName = Read-Host "  请输入你的名字（比如 zuoqiuning）"
        git config --global user.name $userName
    }
    if (-not $userEmail) {
        Write-Host "  ! 未配置 git user.email" -ForegroundColor Yellow
        $userEmail = Read-Host "  请输入你的邮箱"
        git config --global user.email $userEmail
    }
    Write-Host "  ✓ 提交者: $userName <$userEmail>" -ForegroundColor Green
    Write-Host ""

    # ---------- 初始化 .git ----------
    if (-not (Test-Path '.git')) {
        Write-Host "  [1/6] 初始化 git 仓库…"
        git init | Out-Null
        git branch -M $branch 2>$null
    } else {
        Write-Host "  [1/6] git 仓库已存在，跳过初始化"
        # 确保分支名正确
        $currentBranch = git rev-parse --abbrev-ref HEAD 2>$null
        if ($currentBranch -ne $branch) {
            Write-Host "  切换分支 $currentBranch → $branch"
            git branch -M $branch 2>$null
        }
    }

    # ---------- 确保关键文件存在 ----------
    Write-Host "  [2/6] 检查关键文件…"
    $required = @('manifest.json', 'README.md', 'LICENSE', '.gitignore')
    $missing = @()
    foreach ($f in $required) {
        if (-not (Test-Path $f)) { $missing += $f }
    }
    if ($missing.Count -gt 0) {
        Write-Host "  ⚠ 以下文件缺失，建议先补上：" -ForegroundColor Yellow
        $missing | ForEach-Object { Write-Host "    - $_" -ForegroundColor Yellow }
        $ans = Read-Host "  是否继续？(y/n)"
        if ($ans -ne 'y') { throw "用户中止" }
    } else {
        Write-Host "  ✓ 关键文件齐全" -ForegroundColor Green
    }

    # ---------- 敏感信息检查 ----------
    Write-Host "  [3/6] 检查敏感信息…"
    $hits = @()
    $files = Get-ChildItem -Recurse -File -Include *.js, *.json, *.html |
             Where-Object { $_.FullName -notmatch '\\\.git\\' }
    foreach ($f in $files) {
        $content = Get-Content $f.FullName -Raw -ErrorAction SilentlyContinue
        if ($content -match 'sk-[A-Za-z0-9]{20,}') {
            $hits += $f.FullName.Substring($root.Length + 1)
        }
    }
    if ($hits.Count -gt 0) {
        Write-Host "  ⚠ 检测到疑似 API Key，请检查：" -ForegroundColor Red
        $hits | ForEach-Object { Write-Host "    - $_" -ForegroundColor Red }
        $ans = Read-Host "  仍然继续？(y/n)"
        if ($ans -ne 'y') { throw "用户中止" }
    } else {
        Write-Host "  ✓ 未发现敏感信息" -ForegroundColor Green
    }

    # ---------- 配置远程 ----------
    Write-Host "  [4/6] 配置远程仓库…"
    $existingRemote = git remote get-url origin 2>$null
    if ($existingRemote) {
        if ($existingRemote -ne $remoteUrl) {
            git remote set-url origin $remoteUrl
            Write-Host "  ✓ 更新远程地址: $remoteUrl" -ForegroundColor Green
        } else {
            Write-Host "  ✓ 远程已配置: $remoteUrl" -ForegroundColor Green
        }
    } else {
        git remote add origin $remoteUrl
        Write-Host "  ✓ 添加远程: $remoteUrl" -ForegroundColor Green
    }

    # ---------- 添加文件 ----------
    Write-Host "  [5/6] 添加文件…"
    git add -A
    $status = git status --porcelain
    if (-not $status) {
        Write-Host "  ! 没有需要提交的改动" -ForegroundColor Yellow
    } else {
        $count = ($status -split "`n").Count
        Write-Host "  ✓ 待提交文件: $count 个" -ForegroundColor Green
    }

    # ---------- 提交 ----------
    if ($status) {
        $msg = Read-Host "  提交信息（回车使用默认）"
        if (-not $msg) {
            $msg = "update: 自动提交 $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
        }
        git commit -m "$msg" | Out-Null
        Write-Host "  ✓ 已提交: $msg" -ForegroundColor Green
    }

    # ---------- 推送 ----------
    Write-Host "  [6/6] 推送到 Gitee…"
    Write-Host ""
    Write-Host "  ┌─────────────────────────────────────────────┐" -ForegroundColor Yellow
    Write-Host "  │  如果弹出登录框：                            │" -ForegroundColor Yellow
    Write-Host "  │    用户名: zuoqiuning                        │" -ForegroundColor Yellow
    Write-Host "  │    密  码: 粘贴 Gitee 私人令牌（不是登录密码）│" -ForegroundColor Yellow
    Write-Host "  │                                             │" -ForegroundColor Yellow
    Write-Host "  │  生成令牌:                                    │" -ForegroundColor Yellow
    Write-Host "  │  https://gitee.com/profile/personal_access_tokens │" -ForegroundColor Yellow
    Write-Host "  └─────────────────────────────────────────────┘" -ForegroundColor Yellow
    Write-Host ""

    # 首次推送需要 -u
    $hasUpstream = git rev-parse --abbrev-ref "$branch@{upstream}" 2>$null
    if ($hasUpstream) {
        git push origin $branch
    } else {
        git push -u origin $branch
    }

    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "  ✓ 推送成功！" -ForegroundColor Green
        Write-Host "  仓库地址: https://gitee.com/$giteeUser/$repoName" -ForegroundColor Cyan
        Write-Host ""
    } else {
        throw "推送失败，请检查网络或令牌"
    }

} catch {
    Write-Host ""
    Write-Host "  ✗ 出错: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
}

Write-Host "按任意键退出..."
try {
    $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
} catch {
    Read-Host
}