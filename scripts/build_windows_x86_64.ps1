[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$Destination
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$workRoot = if ($env:TUYUFACTORY_WORK_DIR) { $env:TUYUFACTORY_WORK_DIR } else {
  Join-Path ([System.IO.Path]::GetTempPath()) 'tuyufactory\host\windows'
}
$build = if ($env:TUYUFACTORY_BUILD_DIR) { $env:TUYUFACTORY_BUILD_DIR } else { Join-Path $workRoot 'build' }
$dependencyRoot = if ($env:TUYUFACTORY_DEPENDENCY_DIR) { $env:TUYUFACTORY_DEPENDENCY_DIR } else { Join-Path $workRoot 'dependencies' }
$env:TUYUFACTORY_DEPENDENCY_DIR = $dependencyRoot
$sources = Join-Path $dependencyRoot 'archives'
$language = Join-Path $build 'language'
$postgres = Join-Path $build 'postgresql'

if ($env:OS -ne 'Windows_NT') {
  throw '厂家端 Windows 运行包必须在 Windows 主机生成'
}
$architecture = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
if ($architecture -ne 'AMD64') {
  throw "厂家端 Windows 运行包必须在真实 x86-64 主机生成：$architecture"
}
if (Test-Path -LiteralPath $Destination) {
  throw "厂家端运行包目标已经存在：$Destination"
}
$lock = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'runtime.lock.json') -Raw | ConvertFrom-Json
# 产品锁中的同一工具查询同时供下载、展开与版本验真使用。
$nodeQuery = @'
import { pathToFileURL } from 'node:url';
const {runtimeTool} = await import(pathToFileURL(process.argv[1]));
console.log(JSON.stringify(await runtimeTool('node', 'windows')));
'@
$nodeJson = & node --input-type=module -e $nodeQuery (Join-Path $PSScriptRoot 'verify.mjs')
if ($LASTEXITCODE -ne 0) { throw '厂家端Node产品锁查询失败' }
$nodeSource = $nodeJson | ConvertFrom-Json

function Get-LockedArchive {
  param([object]$Source, [string]$Output)
  if (Test-Path -LiteralPath $Output -PathType Leaf) {
    if ((Get-FileHash -LiteralPath $Output -Algorithm SHA256).Hash.ToLowerInvariant() -ne $Source.sha256) {
      throw "厂家依赖缓存摘要不符：$Output"
    }
    return
  }
  $pending = "$Output.pending.$PID"
  for ($attempt = 1; $attempt -le 3; $attempt++) {
    Remove-Item -LiteralPath $pending -Force -ErrorAction SilentlyContinue
    try {
      Invoke-WebRequest -Uri ([Uri]$Source.url) -OutFile $pending -MaximumRedirection 8
      if ((Get-FileHash -LiteralPath $pending -Algorithm SHA256).Hash.ToLowerInvariant() -eq $Source.sha256) {
        Move-Item -LiteralPath $pending -Destination $Output
        return
      }
    } catch {
      if ($attempt -eq 3) { throw }
    }
  }
  Remove-Item -LiteralPath $pending -Force -ErrorAction SilentlyContinue
  throw "厂家依赖三次取得失败：$($Source.url)"
}

function Copy-TreeContents {
  param([string]$Source, [string]$Target)
  New-Item -ItemType Directory -Path $Target -Force | Out-Null
  Copy-Item -Path (Join-Path $Source '*') -Destination $Target -Recurse -Force
}

function Require-X64PE {
  param([string]$File)
  $stream = [IO.File]::OpenRead($File)
  try {
    $reader = [IO.BinaryReader]::new($stream)
    if ($reader.ReadUInt16() -ne 0x5a4d) { throw "Windows PE 文件无效：$File" }
    $stream.Position = 0x3c
    $header = $reader.ReadUInt32()
    $stream.Position = $header
    if ($reader.ReadUInt32() -ne 0x00004550 -or $reader.ReadUInt16() -ne 0x8664) {
      throw "Windows 二进制不是 x86-64：$File"
    }
  } finally {
    $stream.Dispose()
  }
}

try {
  New-Item -ItemType Directory -Path $sources, $language, $postgres -Force | Out-Null
  $pythonArchive = Join-Path $sources 'python-3.14.3-amd64.zip'
  $nodeArchive = Join-Path $sources $nodeSource.filename
  $postgresArchive = Join-Path $sources 'postgresql-17.11-windows-x64.zip'
  Get-LockedArchive $lock.sources.python_windows_x86_64 $pythonArchive
  Get-LockedArchive $nodeSource $nodeArchive
  Get-LockedArchive $lock.sources.postgresql_windows_x86_64 $postgresArchive

  $python = Join-Path $language 'python'
  Expand-Archive -LiteralPath $pythonArchive -DestinationPath $python
  $pythonExe = Join-Path $python 'python.exe'
  & $pythonExe --version
  if ($LASTEXITCODE -ne 0 -or (& $pythonExe --version 2>&1) -notmatch '^Python 3\.14\.3$') {
    throw '厂家端 Windows Python 版本错误'
  }
  & $pythonExe -m ensurepip --upgrade
  if ($LASTEXITCODE -ne 0) { throw '厂家端 Windows Python 无法启用 pip' }

  $nodeExpanded = Join-Path $build 'node-expanded'
  Expand-Archive -LiteralPath $nodeArchive -DestinationPath $nodeExpanded
  Copy-TreeContents (Join-Path $nodeExpanded $nodeSource.root) (Join-Path $language 'node')
  $nodeDirectory = Join-Path $language 'node'
  $nodeExe = Join-Path $nodeDirectory 'node.exe'
  if ((& $nodeExe --version) -ne "v$($nodeSource.version)") { throw '厂家端 Windows Node 版本错误' }
  $env:Path = "$nodeDirectory;$env:Path"

  $apps = Join-Path $language 'bench\apps'
  New-Item -ItemType Directory -Path $apps, (Join-Path $language 'bench\sites'), (Join-Path $language 'lib'), (Join-Path $language 'licenses') -Force | Out-Null
  Copy-Item -LiteralPath (Join-Path $python 'LICENSE.txt') -Destination (Join-Path $language 'licenses\Python-PSF.txt')
  Copy-Item -LiteralPath (Join-Path $language 'node\LICENSE') -Destination (Join-Path $language 'licenses\Node-MIT.txt')
  foreach ($app in @('frappe', 'erpnext')) {
    Copy-Item -LiteralPath (Join-Path $root "imported\$app") -Destination (Join-Path $apps $app) -Recurse
    Get-ChildItem -LiteralPath (Join-Path $apps $app) -Force -Recurse |
      Where-Object { $_.Name -in @('.git', 'node_modules') } |
      Sort-Object FullName -Descending |
      Remove-Item -Recurse -Force
  }
  $project = Join-Path $apps 'frappe\pyproject.toml'
  $value = Get-Content -LiteralPath $project -Raw
  foreach ($dependency in @('PyMySQL==1\.1\.2', 'mysqlclient==2\.2\.7')) {
    $pattern = '    "' + $dependency + '",\r?\n'
    $nextValue = [regex]::Replace($value, $pattern, '', 1)
    if ($nextValue -eq $value) { throw "厂家端 Frappe 数据库依赖行缺失：$dependency" }
    $value = $nextValue
  }
  [IO.File]::WriteAllText($project, $value, [Text.UTF8Encoding]::new($false))
  $env:PYTHONNOUSERSITE = '1'
  $env:PIP_CACHE_DIR = Join-Path $build 'pip'
  & $pythonExe -m pip install --disable-pip-version-check (Join-Path $apps 'frappe')
  if ($LASTEXITCODE -ne 0) { throw '厂家端 Windows Frappe Python 依赖安装失败' }
  & $pythonExe -m pip install --disable-pip-version-check (Join-Path $apps 'erpnext')
  if ($LASTEXITCODE -ne 0) { throw '厂家端 Windows ERPNext Python 依赖安装失败' }
  & $pythonExe -m pip freeze | Sort-Object | Set-Content -LiteralPath (Join-Path $language 'licenses\python-packages.txt') -Encoding Ascii
  & $nodeExe (Join-Path $PSScriptRoot 'build_assets.mjs') $language
  if ($LASTEXITCODE -ne 0) { throw '厂家端 Windows 浏览器资源构建失败' }

  $postgresExpanded = Join-Path $build 'postgres-expanded'
  Expand-Archive -LiteralPath $postgresArchive -DestinationPath $postgresExpanded
  $postgresSource = Join-Path $postgresExpanded 'pgsql'
  Copy-TreeContents (Join-Path $postgresSource 'bin') (Join-Path $postgres 'bin')
  Copy-TreeContents (Join-Path $postgresSource 'lib') (Join-Path $postgres 'lib')
  Copy-TreeContents (Join-Path $postgresSource 'share') (Join-Path $postgres 'share\postgresql')
  New-Item -ItemType Directory -Path (Join-Path $postgres 'licenses') -Force | Out-Null
  foreach ($license in @('server_license.txt', 'commandlinetools_3rd_party_licenses.txt')) {
    Copy-Item -LiteralPath (Join-Path $postgresSource $license) -Destination (Join-Path $postgres 'licenses')
  }

  $vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
  if (-not (Test-Path -LiteralPath $vswhere)) { throw '厂家端 Windows 构建缺少 Visual Studio 定位工具' }
  $installation = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
  $crt = Get-ChildItem -LiteralPath (Join-Path $installation 'VC\Redist\MSVC') -Directory |
    Sort-Object Name -Descending |
    ForEach-Object { Join-Path $_.FullName 'x64\Microsoft.VC143.CRT' } |
    Where-Object { Test-Path -LiteralPath (Join-Path $_ 'vcruntime140.dll') } |
    Select-Object -First 1
  if (-not $crt) { throw '厂家端 Windows 构建缺少 VC143 x86-64 运行库' }
  foreach ($name in @('msvcp140.dll', 'vcruntime140.dll', 'vcruntime140_1.dll')) {
    Copy-Item -LiteralPath (Join-Path $crt $name) -Destination (Join-Path $postgres 'bin') -Force
  }

  & $nodeExe (Join-Path $PSScriptRoot 'materialize.mjs') $language $postgres $Destination
  if ($LASTEXITCODE -ne 0) { throw '厂家端 Windows 运行包物化失败' }
  $peFiles = Get-ChildItem -LiteralPath $Destination -File -Recurse |
    Where-Object { $_.Extension -in @('.exe', '.dll', '.pyd') }
  foreach ($file in $peFiles) {
    Require-X64PE $file.FullName
  }
  Write-Host "途遇厂家端 Windows x86-64 运行包构建通过：$Destination"
} finally {
  foreach ($item in @($build)) {
    if (Test-Path -LiteralPath $item) { Remove-Item -LiteralPath $item -Recurse -Force }
  }
}
