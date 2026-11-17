# 把插件上传到一个新建的公开 GitHub 仓库（幂等，可重复运行）
#
# 用法 A（推荐给没有终端习惯的人）——token 放文件，不经过对话：
#   把 token 存成 C:\Users\<你>\.dsh\gh-token.txt（一行，只有 token）
#   $env:GH_OWNER = '你的GitHub用户名'
#   $env:GH_REPO  = 'dsh-turn-cost-chip'
#   .\publish\publish-github.ps1 -TokenFile "$env:USERPROFILE\.dsh\gh-token.txt"
#
# 用法 B：
#   $env:GH_TOKEN = 'github_pat_...'   # 需要 Contents: Read and write
#   $env:GH_OWNER = '你的GitHub用户名'
#   $env:GH_REPO  = 'dsh-turn-cost-chip'
#   .\publish\publish-github.ps1
#
# 说明：本插件是纯 JS，仓库建好后别人可以直接
#   dsh plugin --profile desktop add github:<OWNER>/<REPO>
# 不需要构建授权，也不需要发 npm。

[CmdletBinding()]
param(
  [string]$Owner = $env:GH_OWNER,
  [string]$Repo = $env:GH_REPO,
  [string]$Token = $env:GH_TOKEN,
  [string]$TokenFile = $env:GH_TOKEN_FILE,
  [string]$Description = 'Show what each reply costs, in CNY, inside DeepSeek Harness',
  [string]$PackageRoot = '',
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
# Windows PowerShell 5.1 上有时需要显式打开 TLS 1.2 才能访问 api.github.com
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch { }
if (-not $Token -and $TokenFile) {
  if (-not (Test-Path $TokenFile)) { throw "找不到 token 文件：$TokenFile" }
  $Token = (Get-Content $TokenFile -TotalCount 1).Trim()
}
if ($Token) { $env:GH_TOKEN = $Token }
if (-not $Owner -or -not $Repo -or -not $Token) {
  throw '请先设置 GH_OWNER / GH_REPO，并提供 GH_TOKEN 或 -TokenFile。'
}

$packageRoot = if ($PackageRoot) {
  $PackageRoot
} elseif ($PSScriptRoot) {
  Split-Path -Parent $PSScriptRoot
} else {
  (Get-Location).Path
}
if (-not (Test-Path (Join-Path $packageRoot 'package.json'))) {
  throw "在 $packageRoot 没找到 package.json；用 -PackageRoot 指定插件目录。"
}
$api = 'https://api.github.com'
$headers = @{
  Authorization = "Bearer $Token"
  'User-Agent'  = 'dsh-turn-cost-publish'
  Accept        = 'application/vnd.github+json'
}

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

# 1. 仓库：存在就复用，不存在就建
$repoExists = $false
try {
  $null = Invoke-Github GET "/repos/$Owner/$Repo"
  $repoExists = $true
  Write-Host "仓库已存在，继续更新文件：$Owner/$Repo"
} catch {
  if ((Get-StatusCode $_) -ne 404) { throw }
}
if (-not $repoExists) {
  $null = Invoke-Github POST '/user/repos' @{
    name        = $Repo
    private     = $false
    description = $Description
    has_issues  = $true
    has_wiki    = $false
  }
  Write-Host "已创建公开仓库：$Owner/$Repo"
}

# 2. 上传/更新文件（逐个文件一次提交；已存在的文件带 sha 覆盖）
$skipPatterns = @('node_modules', '\.git', '\.tgz$', '\.DS_Store$', '(^|/)\.gh-token', '(^|/)token\.txt$')
$files = Get-ChildItem -Path $packageRoot -Recurse -File | Where-Object {
  $relative = $_.FullName.Substring($packageRoot.Length + 1).Replace('\', '/')
  -not ($skipPatterns | Where-Object { $relative -match $_ })
}

if (-not $files) { throw "在 $packageRoot 下没有找到可上传的文件。" }

foreach ($file in $files) {
  $relative = $file.FullName.Substring($packageRoot.Length + 1).Replace('\', '/')
  $contentPath = "/repos/$Owner/$Repo/contents/$relative"

  $sha = $null
  try {
    $existing = Invoke-Github GET $contentPath
    if ($existing) { $sha = $existing.sha }
  } catch {
    if ((Get-StatusCode $_) -ne 404) { throw }
  }

  $body = @{
    message = if ($sha) { "update $relative" } else { "add $relative" }
    content = [Convert]::ToBase64String([IO.File]::ReadAllBytes($file.FullName))
  }
  if ($sha) { $body.sha = $sha }

  $null = Invoke-Github PUT $contentPath $body
  Write-Host ("  {0} {1}" -f ($(if ($sha) { 'updated' } else { 'added  ' })), $relative)
}

# 3. topics（目录要求至少 dsh-plugin）
try {
  $null = Invoke-Github PUT "/repos/$Owner/$Repo/topics" @{
    names = @('dsh-plugin', 'deepseek-harness', 'dsh-plugin-ui', 'cost-tracking')
  }
  Write-Host '已设置 topics：dsh-plugin / deepseek-harness / dsh-plugin-ui / cost-tracking'
} catch {
  Write-Host "topics 设置失败（可以在仓库页 About 里手动加 dsh-plugin）：$($_.Exception.Message)"
}

Write-Host ''
Write-Host "完成：https://github.com/$Owner/$Repo"
Write-Host '下一步：'
Write-Host "  1) 打开仓库确认 README 正常显示、About 里能看到 dsh-plugin topic"
Write-Host "  2) 满 24 小时后运行 .\publish\submit-catalog.ps1 提收录 PR"
Write-Host "  3) 立刻想给别人装的话：dsh plugin --profile desktop add github:$Owner/$Repo"
