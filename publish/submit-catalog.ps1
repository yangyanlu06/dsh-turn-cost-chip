# 给 awesome-dsh-plugin 提交收录 PR（仓库满 24 小时后运行）
#
# 用法：
#   $env:GH_TOKEN = 'github_pat_...'   # 需要 Contents + Pull requests 的读写权限
#   $env:GH_OWNER = '你的GitHub用户名'
#   $env:GH_REPO  = 'dsh-turn-cost-chip'
#   .\publish\submit-catalog.ps1
#
# 它会：检查仓库年龄 → fork 精选目录 → 在你 fork 里新建 data/plugins/<owner>__<repo>.yml → 开 PR。
# 重复运行是安全的：文件已存在就更新，PR 已存在就只打印链接。

[CmdletBinding()]
param(
  [string]$Owner = $env:GH_OWNER,
  [string]$Repo = $env:GH_REPO,
  [string]$Token = $env:GH_TOKEN,
  [string]$TokenFile = $env:GH_TOKEN_FILE,
  [string]$Upstream = 'awesome-dsh-plugin/awesome-dsh-plugin',
  [string]$EntryFile = '',
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch { }
if (-not $Token -and $TokenFile) {
  if (-not (Test-Path $TokenFile)) { throw "找不到 token 文件：$TokenFile" }
  $Token = (Get-Content $TokenFile -TotalCount 1).Trim()
}
if ($Token) { $env:GH_TOKEN = $Token }
if (-not $Owner -or -not $Repo -or -not $Token) {
  throw '请先设置 GH_OWNER / GH_REPO，并提供 GH_TOKEN 或 -TokenFile。'
}

$api = 'https://api.github.com'
$headers = @{
  Authorization = "Bearer $Token"
  'User-Agent'  = 'dsh-turn-cost-publish'
  Accept        = 'application/vnd.github+json'
}
$upstreamRepo = $Upstream.Split('/')[-1]
$upstreamOwner = $Upstream.Split('/')[0]
$entryPath = "data/plugins/${Owner}__${Repo}.yml"

function Invoke-Github {
  param([string]$Method, [string]$Path, $Body)
  $uri = if ($Path.StartsWith('http')) { $Path } else { "$api$Path" }
  if ($DryRun) {
    Write-Host "[dry-run] $Method $uri"
    return $null
  }
  $params = @{ Method = $Method; Uri = $uri; Headers = $headers; TimeoutSec = 60 }
  if ($null -ne $Body) {
    $params.ContentType = 'application/json'
    $params.Body = ($Body | ConvertTo-Json -Depth 8)
  }
  Invoke-RestMethod @params
}

function Get-StatusCode {
  param($ErrorRecord)
  try { return [int]$ErrorRecord.Exception.Response.StatusCode } catch { return 0 }
}

# 1. 仓库存在 + 年龄门槛（CI 会检查，满 24 小时才过）
$repoInfo = Invoke-Github GET "/repos/$Owner/$Repo"
if (-not $repoInfo) { throw "仓库 $Owner/$Repo 不存在，先运行 publish-github.ps1。" }
$created = [datetime]::Parse($repoInfo.created_at, [cultureinfo]::InvariantCulture, [System.Globalization.DateTimeStyles]::AdjustToUniversal)
$ageHours = ((Get-Date).ToUniversalTime() - $created).TotalHours
Write-Host ("仓库创建于 {0} UTC，已存在 {1:N1} 小时" -f $created.ToString('yyyy-MM-dd HH:mm'), $ageHours)
if ($ageHours -lt 24) {
  Write-Warning ("还差 {0:N1} 小时才满 24 小时。CI 会拦下，晚点再跑一次即可（不用重开 PR）。" -f (24 - $ageHours))
}

# 2. 条目内容（按目录的真实 schema；只有 description.en 必填）
$entryFile = if ($EntryFile) {
  $EntryFile
} elseif ($PSScriptRoot) {
  Join-Path $PSScriptRoot 'catalog-entry.yml'
} else {
  Join-Path (Get-Location).Path 'catalog-entry.yml'
}
if (-not (Test-Path $entryFile)) { throw "缺少条目模板：$entryFile（用 -EntryFile 指定）" }
$entry = (Get-Content $entryFile -Raw).
  Replace('__OWNER__', $Owner).
  Replace('__REPO__', $Repo).
  Replace('__GITHUB_URL__', "https://github.com/$Owner/$Repo")
Write-Host "条目内容："
Write-Host $entry

# 3. fork 精选目录（已有就复用）
$forkReady = $false
try {
  $null = Invoke-Github GET "/repos/$Owner/$upstreamRepo"
  $forkReady = $true
  Write-Host "已有 fork：$Owner/$upstreamRepo"
} catch {
  if ((Get-StatusCode $_) -ne 404) { throw }
}
if (-not $forkReady) {
  $null = Invoke-Github POST "/repos/$Upstream/forks" @{}
  Write-Host "已发起 fork，等待 GitHub 准备好…"
  for ($i = 0; $i -lt 30 -and -not $forkReady; $i++) {
    Start-Sleep -Seconds 4
    try { $null = Invoke-Github GET "/repos/$Owner/$upstreamRepo"; $forkReady = $true } catch { }
  }
  if (-not $forkReady) { throw 'fork 还没准备好，稍等几分钟再运行本脚本。' }
}

# 4. 在 fork 里写条目文件
$contentPath = "/repos/$Owner/$upstreamRepo/contents/$entryPath"
$sha = $null
try {
  $existing = Invoke-Github GET $contentPath
  if ($existing) { $sha = $existing.sha }
} catch {
  if ((Get-StatusCode $_) -ne 404) { throw }
}
$body = @{
  message = "Add $Owner/$Repo"
  content = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($entry))
}
if ($sha) { $body.sha = $sha }
$null = Invoke-Github PUT $contentPath $body
Write-Host "已写入 $Owner/$upstreamRepo/$entryPath"

# 5. 开 PR（已存在就打印链接）
$forkInfo = Invoke-Github GET "/repos/$Owner/$upstreamRepo"
$branch = if ($forkInfo) { $forkInfo.default_branch } else { 'main' }
try {
  $pr = Invoke-Github POST "/repos/$Upstream/pulls" @{
    title = "Add $Owner/$Repo"
    head  = "${Owner}:$branch"
    base  = 'main'
    body  = @"
Adds one plugin entry.

- Repository: https://github.com/$Owner/$Repo
- Category: usage
- What it does: shows each completed reply's cost in CNY inside the conversation and the conversation total in the composer dock, priced from DeepSeek list prices with the peak/off-peak band. It reads only token usage the Session already recorded and sends no extra request.
"@
  }
  Write-Host "PR 已创建：$($pr.html_url)"
} catch {
  if ((Get-StatusCode $_) -eq 422) {
    Write-Host "可能已有来自 ${Owner}:$branch 的 PR，去这里看：https://github.com/$Upstream/pulls?q=is%3Apr+author%3A$Owner"
  } else { throw }
}
