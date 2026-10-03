[CmdletBinding()]
param(
    [switch]$SkipInstall,
    [string]$ArtifactDirectory
)

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
if ($PSVersionTable.PSVersion.Major -lt 7) { throw 'Local CI requires PowerShell 7.' }
$repository = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if ([string]::IsNullOrWhiteSpace($ArtifactDirectory)) {
    $ArtifactDirectory = Join-Path $repository '.kingdots/ci-artifacts'
}
$ArtifactDirectory = [IO.Path]::GetFullPath($ArtifactDirectory)
$runName = if ($env:GITHUB_RUN_ID -match '^\d+$' -and $env:GITHUB_RUN_ATTEMPT -match '^\d+$') {
    "$($env:GITHUB_RUN_ID)-$($env:GITHUB_RUN_ATTEMPT)"
} else {
    'local-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [Guid]::NewGuid().ToString('N')
}

function Get-SourceSnapshot {
    $commit = (& git -C $repository rev-parse HEAD).Trim()
    if ($LASTEXITCODE -ne 0) { throw 'CI requires a committed Git repository.' }
    $status = @(& git -C $repository status --porcelain)
    if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect the Git working state.' }
    $paths = ((& git -C $repository ls-files --cached --others --exclude-standard -z) -join "`n").Split([char]0) |
        Where-Object { $_ } | Sort-Object -Unique -CaseSensitive
    if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect the source file inventory.' }
    $hash = [Security.Cryptography.IncrementalHash]::CreateHash([Security.Cryptography.HashAlgorithmName]::SHA256)
    try {
        foreach ($relative in $paths) {
            $path = [IO.Path]::GetFullPath((Join-Path $repository $relative))
            $prefix = $repository.TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
            if (-not $path.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Source path leaves the repository.' }
            $hash.AppendData([Text.Encoding]::UTF8.GetBytes($relative + [char]0))
            if (Test-Path -LiteralPath $path -PathType Leaf) {
                $item = Get-Item -LiteralPath $path -Force
                if ($item.LinkType) { $hash.AppendData([Text.Encoding]::UTF8.GetBytes([string]$item.LinkTarget)) }
                else { $hash.AppendData([IO.File]::ReadAllBytes($path)) }
            } else { $hash.AppendData([Text.Encoding]::UTF8.GetBytes('deleted')) }
            $hash.AppendData([byte[]]@(0))
        }
        return @{ commit = $commit; fingerprint = [Convert]::ToHexString($hash.GetHashAndReset()).ToLowerInvariant(); dirty = ($status.Count -gt 0) }
    } finally { $hash.Dispose() }
}

Push-Location -LiteralPath $repository
try {
    $source = Get-SourceSnapshot
    if ($env:GITHUB_ACTIONS -eq 'true') {
        if ($env:GITHUB_REPOSITORY -ne 'OtterHelm/kingdots' -or $env:GITHUB_REF -ne 'refs/heads/main' -or
            $env:GITHUB_EVENT_NAME -notin @('push', 'workflow_dispatch')) { throw 'This local runner only executes trusted kingdots main events.' }
        if ($source.dirty -or $source.commit -ne $env:GITHUB_SHA) { throw 'CI checkout is dirty or does not match the workflow commit.' }
    }
    $output = Join-Path (Join-Path $ArtifactDirectory $source.commit) $runName
    New-Item -ItemType Directory -Path $output -Force | Out-Null
    $receipt = [ordered]@{
        schemaVersion = 1; source = $source; runId = $env:GITHUB_RUN_ID; attempt = $env:GITHUB_RUN_ATTEMPT
        startedAt = [DateTimeOffset]::UtcNow.ToString('o'); finishedAt = $null; passed = $false
        steps = @(); package = $null; error = $null
    }
    try {
        # Keep CI separate from personal worker authentication and account state.
        foreach ($name in @('OPENAI_API_KEY', 'CODEX_API_KEY', 'OPENAI_BASE_URL', 'ANTHROPIC_API_KEY',
                            'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN', 'CODEX_API_BASE_URL', 'CODEX_API_ENDPOINT')) {
            Remove-Item -LiteralPath "Env:$name" -ErrorAction SilentlyContinue
        }
        $env:CODEX_HOME = Join-Path $output 'isolated-codex'
        $env:CLAUDE_CONFIG_DIR = Join-Path $output 'isolated-claude'
        $node = (Get-Command node -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
        $version = (& $node --version).Trim()
        if ($LASTEXITCODE -ne 0 -or $version -notmatch '^v24\.') { throw 'The local runner requires installed Node.js 24.' }
        $npmShim = (Get-Command npm.cmd -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
        $npmCli = Join-Path (Split-Path -Parent $npmShim) 'node_modules/npm/bin/npm-cli.js'
        if (-not (Test-Path -LiteralPath $npmCli -PathType Leaf)) { throw 'Cannot locate the installed npm JavaScript entry point.' }
        $receipt['nodeVersion'] = $version
        Write-Host "Local CI: Node $version; source $($source.commit); run $runName"

        function Invoke-NpmStep([string]$Name, [string[]]$Arguments) {
            $started = [DateTimeOffset]::UtcNow
            $log = Join-Path $output "$Name.log"
            Write-Host "[$Name] npm $($Arguments -join ' ')"
            & $node $npmCli @Arguments 2>&1 | Tee-Object -FilePath $log | Out-Host
            $code = $LASTEXITCODE
            $receipt.steps += @{ name = $Name; argv = @($node, $npmCli) + $Arguments; exitCode = $code
                startedAt = $started.ToString('o'); finishedAt = [DateTimeOffset]::UtcNow.ToString('o'); log = "$Name.log" }
            if ($code -ne 0) { throw "CI step '$Name' failed with exit code $code." }
        }

        if (-not $SkipInstall) { Invoke-NpmStep 'install' @('ci', '--include=dev') }
        Invoke-NpmStep 'typecheck' @('run', 'typecheck')
        Invoke-NpmStep 'tests' @('test')
        Invoke-NpmStep 'build' @('run', 'build')
        # Required gates have already run once; never invoke a second prepack loop.
        Invoke-NpmStep 'package' @('pack', '--ignore-scripts')
        $current = Get-SourceSnapshot
        if ($current.commit -ne $source.commit -or $current.fingerprint -ne $source.fingerprint) { throw 'Source changed during CI; this receipt cannot establish a pass.' }
        $manifest = Get-Content -LiteralPath 'package.json' -Raw | ConvertFrom-Json
        if ($manifest.name -ne 'kingdots' -or $manifest.version -notmatch '^\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]+)?$') { throw 'Unexpected package identity.' }
        $packageName = "kingdots-$($manifest.version).tgz"
        $packageFile = Join-Path $repository $packageName
        $members = @(& tar -tf $packageFile)
        if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect the generated package.' }
        foreach ($member in $members) {
            if ($member -notmatch '^package/(dist/|web-dist/|relay/(?:worker/|db/|drizzle/|scripts/|\.openai/hosting\.template\.json$|package(?:-lock)?\.json$|drizzle\.config\.ts$|README\.md$)|docs/|LICENSE$|NOTICE$|README\.md$|package\.json$)' -or
                $member -match '(^|/)(\.kingdots|\.env(?:\.|$)|node_modules|tests|experiments|device-probe.mjs|hosting.json|secrets\.bin|kingdots\.sqlite|instance\.json|service\.lock)(/|\.|$)|(^|/)\.\.(/|$)') {
                throw 'Generated package contains an unexpected or local-only member.'
            }
        }
        Copy-Item -LiteralPath $packageFile -Destination (Join-Path $output $packageName)
        $receipt.package = @{ file = $packageName; sha256 = (Get-FileHash -LiteralPath $packageFile -Algorithm SHA256).Hash.ToLowerInvariant()
            bytes = (Get-Item -LiteralPath $packageFile).Length }
        $receipt.passed = $true
        Write-Host 'PASS local CI: typecheck, tests, build, package and unchanged source. Artifact retained locally.'
    } catch {
        $receipt.error = $_.Exception.Message
        throw
    } finally {
        $receipt.finishedAt = [DateTimeOffset]::UtcNow.ToString('o')
        $receipt | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $output 'receipt.json') -Encoding utf8
    }
} finally { Pop-Location }
