# ============================================================
# 屿宁学习通助手 · 提交/发布前自检（check.ps1）
# 用法：cd D:\Desktop\yuni-chaoxing-helper; .\check.ps1
# 说明：只读检查，不修改任何文件；全部通过时退出码为 0
# ============================================================

$ErrorActionPreference = 'Continue'
# 必须放在最前：否则 node 的 UTF-8 输出会被按 GBK 解码成乱码
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$script:fail = 0
$script:warn = 0

function Section($title) {
  Write-Host ""
  Write-Host "===== $title =====" -ForegroundColor Cyan
}
function Pass($msg) { Write-Host "  [OK]   $msg" -ForegroundColor Green }
function Fail($msg) { Write-Host "  [FAIL] $msg" -ForegroundColor Red; $script:fail++ }
function Warn($msg) { Write-Host "  [WARN] $msg" -ForegroundColor Yellow; $script:warn++ }

# 解析 node 可执行文件（优先 managed 版本）
function Resolve-Node {
  $managed = 'C:\Users\Administrator\.workbuddy\binaries\node\versions\22.22.2-3\node.exe'
  if (Test-Path -LiteralPath $managed) { return $managed }
  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  return $null
}

Write-Host ""
Write-Host "==================================================" -ForegroundColor Magenta
Write-Host "  屿宁学习通助手 · 提交/发布前自检" -ForegroundColor Magenta
Write-Host "  目录: $root" -ForegroundColor DarkGray
Write-Host "==================================================" -ForegroundColor Magenta

# ------------------------------------------------------------
# 1. 全树禁止 `_` 前缀（Chrome/Edge 保留名，会导致扩展整体加载失败）
# ------------------------------------------------------------
Section '1. 保留名检查（_ 前缀）'
$bad = @(Get-ChildItem -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue |
         Where-Object { $_.Name -like '_*' -and $_.FullName -notmatch '\\_locales(\\|$)' })
if ($bad.Count -gt 0) {
  foreach ($b in $bad) { Fail ('保留名条目: ' + $b.FullName.Substring($root.Length + 1)) }
  Write-Host "         提示：Chrome 会拒绝加载含下划线前缀的扩展目录" -ForegroundColor DarkGray
} else {
  Pass '全树无 _ 前缀文件/目录'
}

# ------------------------------------------------------------
# 2. manifest.json 合法性 + 被引用文件存在性
# ------------------------------------------------------------
Section '2. manifest.json 与引用完整性'
$manifestPath = Join-Path $root 'manifest.json'
$mf = $null
try {
  $mf = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
  Pass 'manifest.json 是合法 JSON'
} catch {
  Fail ('manifest.json 解析失败: ' + $_.Exception.Message)
}

$referenced = @()
if ($mf) {
  Write-Host ("         名称={0}  版本={1}  manifest_version={2}" -f $mf.name, $mf.version, $mf.manifest_version) -ForegroundColor DarkGray
  if ($mf.background.service_worker) { $referenced += $mf.background.service_worker }
  if ($mf.side_panel.default_path)   { $referenced += $mf.side_panel.default_path }
  foreach ($cs in $mf.content_scripts) {
    if ($cs.js) { $referenced += $cs.js }
    if ($cs.css) { $referenced += $cs.css }
  }
  $missing = @()
  foreach ($p in $referenced) {
    if (-not (Test-Path -LiteralPath (Join-Path $root ($p -replace '/', '\')))) { $missing += $p }
  }
  if ($missing.Count -gt 0) {
    foreach ($m in $missing) { Fail ('manifest 引用缺失: ' + $m) }
  } else {
    Pass ("manifest 引用的 $($referenced.Count) 个文件全部存在")
  }
  if (-not $mf.icons) { Warn 'manifest 未声明 icons（加载后为浏览器默认图标，不阻止加载）' }
}

# ------------------------------------------------------------
# 3. sidepanel.html 的 script/link 引用存在性
# ------------------------------------------------------------
Section '3. sidepanel.html 资源引用'
$htmlPath = Join-Path $root 'sidepanel\sidepanel.html'
if (Test-Path -LiteralPath $htmlPath) {
  $html = Get-Content -LiteralPath $htmlPath -Raw -Encoding UTF8
  $refs = @()
  foreach ($m in [regex]::Matches($html, 'src="([^"]+)"'))   { $refs += $m.Groups[1].Value }
  foreach ($m in [regex]::Matches($html, 'href="([^"]+)"'))  { $refs += $m.Groups[1].Value }
  $missHtml = @()
  foreach ($r in $refs) {
    if ($r -match '^(https?:)?//') { continue }
    $p = Join-Path $root ('sidepanel\' + ($r -replace '/', '\'))
    if (-not (Test-Path -LiteralPath $p)) { $missHtml += $r }
  }
  if ($missHtml.Count -gt 0) {
    foreach ($m in $missHtml) { Fail ('sidepanel.html 引用缺失: ' + $m) }
  } else {
    Pass ("sidepanel.html 的 $($refs.Count) 个资源引用全部存在")
  }
} else {
  Fail 'sidepanel.html 不存在'
}

# ------------------------------------------------------------
# 4. 全部 .js 语法检查（node --check）
# ------------------------------------------------------------
Section '4. JavaScript 语法检查'
$node = Resolve-Node
if (-not $node) {
  Warn '未找到 node，跳过语法检查'
} else {
  $jsFiles = @(Get-ChildItem -LiteralPath $root -Recurse -File -Filter *.js |
               Where-Object { $_.FullName -notmatch '\\\.workbuddy\\|\\node_modules\\' })
  $syntaxBad = @()
  foreach ($f in $jsFiles) {
    & $node --check $f.FullName *> $null
    if ($LASTEXITCODE -ne 0) { $syntaxBad += $f.FullName.Substring($root.Length + 1) }
  }
  if ($syntaxBad.Count -gt 0) {
    foreach ($b in $syntaxBad) { Fail ('语法错误: ' + $b) }
  } else {
    Pass ("$($jsFiles.Count) 个 .js 语法全部通过")
  }
}

# ------------------------------------------------------------
# 4b. 选择器集中化守卫：平台选择器字面量只允许出现在 content/selectors.js
#     （先剥掉 SEL.xxx 引用与注释行，再匹配特征 token；区分大小写）
# ------------------------------------------------------------
Section '4b. 选择器集中化守卫'
$selPath = Join-Path $root 'content\selectors.js'
if (Test-Path -LiteralPath $selPath) {
  $tokens = @(
    '\.(ans-|posCatalog|layui|Zy_|TiMu|edui|num_option|answerBg|answer_p|singleQuesId|questionLi|check_answer|spanText|icon_Completed|mask-tip|popup-tip|swiper-|pdfViewer|pdf-viewer|viewerContainer|pdfContainer|scroll-container|reader-container|mark_name|stem_answer|completeBtn|turnpage|face-verify|verifyBox|check-code|verify-box|captcha-box|job-limit)',
    'ananas/modules|pan-yz\.chaoxing|downloadfile',
    'ucode|verifyImg|firstLayer|curChapterId|searchChapterListByName'
  )
  $violations = @()
  foreach ($f in (Get-ChildItem -LiteralPath (Join-Path $root 'content') -Recurse -File -Filter *.js)) {
    if ($f.FullName -eq $selPath) { continue }
    $i = 0
    foreach ($line in (Get-Content -LiteralPath $f.FullName -Encoding UTF8)) {
      $i++
      $t = $line.TrimStart()
      if ($t.StartsWith('//') -or $t.StartsWith('*') -or $t.StartsWith('/*')) { continue }
      $code2 = $line -replace 'SEL\.\w+', '' -replace 'CXH\.SEL', ''
      foreach ($tk in $tokens) {
        if ([regex]::IsMatch($code2, $tk)) {
          $violations += ('{0}:{1}  {2}' -f $f.Name, $i, $line.Trim())
          break
        }
      }
    }
  }
  if ($violations.Count -gt 0) {
    foreach ($v in $violations) { Fail ('平台选择器未集中化: ' + $v) }
    Write-Host '         修复方式：把选择器加入 content/selectors.js，代码改用 SEL.xxx 引用' -ForegroundColor DarkGray
  } else {
    Pass '平台选择器字面量仅存在于 content/selectors.js'
  }
} else {
  Fail 'content/selectors.js 不存在'
}

# ------------------------------------------------------------
# 5. 版本号一致性（manifest.version 与 release.ps1 的 $ver）
#    仅做文本解析，绝不执行 release.ps1
# ------------------------------------------------------------
Section '5. 版本号一致性'
$releasePath = Join-Path $root 'release.ps1'
if ((Test-Path -LiteralPath $releasePath) -and $mf) {
  $relRaw = Get-Content -LiteralPath $releasePath -Raw -Encoding UTF8
  $verMatch = [regex]::Match($relRaw, '\$ver\s*=\s*"([^"]+)"')
  if ($verMatch.Success) {
    $relVer = $verMatch.Groups[1].Value
    if ($relVer -eq $mf.version) {
      Pass ("manifest.version = release.ps1 `$ver = $relVer")
    } else {
      Fail ("版本不一致: manifest=$($mf.version)  release.ps1=$relVer")
    }
  } else {
    Warn '未能从 release.ps1 解析出 $ver'
  }
} else {
  Warn 'release.ps1 不存在，跳过版本一致性检查'
}

# ------------------------------------------------------------
# 6. 打包排除规则自洽性检查
#    跟踪文件命中排除规则 = 只进仓库、不进 zip（脚本/测试等仓库资产），属预期；
#    真正要拦的是两类：① .workbuddy/ 等内部目录被跟踪（会推向公开仓库）
#                     ② zip 打包阶段由 release.ps1 §3 硬拦截兜底
# ------------------------------------------------------------
Section '6. 打包排除规则自洽性检查'
$gitOk = $false
try {
  $inside = (& git rev-parse --is-inside-work-tree 2>$null | Out-String).Trim()
  if ($inside -eq 'true') { $gitOk = $true }
} catch { $gitOk = $false }

if (-not $gitOk) {
  Warn '当前目录不是 git 工作树，跳过打包命中检查'
} elseif (-not (Test-Path -LiteralPath $releasePath)) {
  Warn 'release.ps1 不存在，跳过打包命中检查'
} else {
  $relRaw2 = Get-Content -LiteralPath $releasePath -Raw -Encoding UTF8
  $block = [regex]::Match($relRaw2, '\$excludePatterns\s*=\s*@\(([\s\S]*?)\)')
  if (-not $block.Success) {
    Warn '未能从 release.ps1 解析出 $excludePatterns'
  } else {
    $pats = @([regex]::Matches($block.Groups[1].Value, "'([^']*)'") | ForEach-Object { $_.Groups[1].Value })
    $tracked = @(& git -c core.quotepath=false ls-files 2>$null)
    $repoOnly = @()
    $innerTracked = @()
    foreach ($f in $tracked) {
      $fn = $f -replace '\\', '/'
      if ($fn -match '^\.workbuddy/') { $innerTracked += $fn; continue }
      foreach ($p in $pats) { if ($fn -match $p) { $repoOnly += "$fn  <-- $p"; break } }
    }
    if ($innerTracked.Count -gt 0) {
      foreach ($b in $innerTracked) { Fail ('内部目录文件被 git 跟踪（将推向公开仓库）: ' + $b) }
    } else {
      Pass '.workbuddy/ 未被 git 跟踪'
    }
    if ($repoOnly.Count -gt 0) {
      Pass ("$($repoOnly.Count) 个仓库资产仅入仓库、排除出 zip（预期）:")
      $repoOnly | ForEach-Object { Write-Host ("           " + $_) -ForegroundColor DarkGray }
    } else {
      Pass '无命中排除规则的跟踪文件'
    }
    Write-Host ("         排除规则: " + ($pats -join ' , ')) -ForegroundColor DarkGray
  }
}

# ------------------------------------------------------------
# 7. 单元测试
# ------------------------------------------------------------
Section '7. 单元测试'
$testDir = Join-Path $root 'test'
if (-not (Test-Path -LiteralPath $testDir)) {
  Warn 'test/ 目录不存在，跳过测试'
} elseif (-not $node) {
  Warn '未找到 node，跳过测试'
} else {
  $testFiles = @(Get-ChildItem -LiteralPath $testDir -File -Filter *.test.js | Sort-Object Name)
  if ($testFiles.Count -eq 0) {
    Warn 'test/ 下没有 *.test.js'
  } else {
    foreach ($t in $testFiles) {
      Write-Host ("         ▶ " + $t.Name) -ForegroundColor DarkGray
      $out = (& $node $t.FullName 2>&1 | Out-String)
      if ($LASTEXITCODE -eq 0) {
        $summary = ($out -split "`r?`n" | Where-Object { $_ -match '通过|失败|PASS|FAIL' } | Select-Object -Last 1)
        Pass ("$($t.Name) 通过  $($summary -replace '^\s+', '')")
      } else {
        Fail ("$($t.Name) 未通过")
        ($out -split "`r?`n") | Where-Object { $_ -match 'FAIL|Error|error' } | Select-Object -First 10 |
          ForEach-Object { Write-Host ("             " + $_) -ForegroundColor DarkGray }
      }
    }
  }
}

# ------------------------------------------------------------
# 汇总
# ------------------------------------------------------------
Write-Host ""
Write-Host "==================================================" -ForegroundColor Magenta
if ($script:fail -eq 0) {
  Write-Host "  自检通过（$script:warn 个警告）" -ForegroundColor Green
} else {
  Write-Host "  自检未通过：$script:fail 个失败，$script:warn 个警告" -ForegroundColor Red
}
Write-Host "==================================================" -ForegroundColor Magenta
Write-Host ""

exit $script:fail
