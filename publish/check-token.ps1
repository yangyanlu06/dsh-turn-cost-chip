# 校验 GitHub token：只读，不创建任何东西
#
#   .\publish\check-token.ps1 -TokenFile "$env:USERPROFILE\.dsh\gh-token.txt"
#
# 用来在真正建仓库之前确认：token 有效、属于哪个账号、是 classic 还是
# fine-grained、还差哪些权限。

[CmdletBinding()]
param(
  [string]$Token = $env:GH_TOKEN,
  [string]$TokenFile = $env:GH_TOKEN_FILE
)

$ErrorActionPreference = 'Stop'
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch { }

if (-not $Token -and $TokenFile) {
  if (-not (Test-Path $TokenFile)) { throw "找不到 token 文件：$TokenFile" }
  $Token = (Get-Content $TokenFile -TotalCount 1)
}
if (-not $Token) { throw '没有 token：用 -TokenFile 指向保存 token 的文本文件。' }
$Token = $Token.Trim()
if ($Token -match '\s') { throw 'token 里像是混入了空格或换行，请确认文件里只有一行 token。' }

$kind = if ($Token -like 'ghp_*') {
  'classic'
} elseif ($Token -like 'github_pat_*') {
  'fine-grained'
} elseif ($Token -like 'github_pat_11*') {
  'fine-grained'
} else {
  'unknown'
}
Write-Host ("token: 已读取（长度 {0}，类型 {1}）" -f $Token.Length, $kind)

$headers = @{
  Authorization = "Bearer $Token"
  'User-Agent'  = 'dsh-turn-cost-check'
  Accept        = 'application/vnd.github+json'
}

try {
  $response = Invoke-WebRequest -Uri 'https://api.github.com/user' -Headers $headers -TimeoutSec 30 -UseBasicParsing
} catch {
  $code = try { [int]$_.Exception.Response.StatusCode } catch { 0 }
  if ($code -eq 401) { throw 'token 无效或已过期（401）。请在 GitHub 重新生成一个，再更新文件。' }
  if ($code -eq 403) { throw '这次请求被拒绝（403）。可能是 token 权限不足，或复制时漏了字符。' }
  throw "校验失败：HTTP $code — $($_.Exception.Message)"
}

$user = $response.Content | ConvertFrom-Json
$scopes = $response.Headers['X-OAuth-Scopes']
$remaining = $response.Headers['X-RateLimit-Remaining']
$limit = $response.Headers['X-RateLimit-Limit']

Write-Host ("账号: {0}（{1}）" -f $user.login, $user.name)
Write-Host ("配额: {0}/{1}" -f $remaining, $limit)

if ($scopes) {
  Write-Host ("classic scopes: {0}" -f ($scopes -join ', '))
} else {
  Write-Host 'classic scopes: （无，说明是 fine-grained token）'
}

$problem = $false
if ($kind -eq 'classic') {
  if ($scopes -notcontains 'repo' -and $scopes -notcontains 'public_repo') {
    Write-Warning '这个 classic token 没有勾 `repo`（或 `public_repo`）：不能建仓库、不能写文件、不能开 PR。'
    $problem = $true
  }
} elseif ($kind -eq 'fine-grained') {
  Write-Host '检查 fine-grained 权限（在 token 页面的 Repository permissions 里）：'
  Write-Host '  Contents            -> Read and write   （上传文件）'
  Write-Host '  Administration      -> Read and write   （创建仓库）'
  Write-Host '  Pull requests       -> Read and write   （开 PR）'
  Write-Host '  Repository access   -> All repositories'
}

if ($user.login) {
  Write-Host ''
  Write-Host ("可以开始了：接下来会建 https://github.com/{0}/dsh-turn-cost-chip" -f $user.login)
}
if ($problem) { exit 2 }
