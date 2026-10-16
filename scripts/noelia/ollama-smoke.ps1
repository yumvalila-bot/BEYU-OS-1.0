<#
.SYNOPSIS
    NOELIA local Ollama smoke test and diagnostics for BEYU OS (Windows PowerShell).

.DESCRIPTION
    Checks the local Ollama runtime, verifies the configured model, proves the
    governed BEYU adapter against it, and runs the relevant test suites.

    READ-ONLY WITH RESPECT TO YOUR MACHINE. This script:
      - never opens a firewall port, never creates a tunnel and never changes
        network or Ollama configuration;
      - never prints a secret (there is no Ollama credential; the endpoint is
        configuration only);
      - only sets environment variables in the CURRENT PowerShell session.

    Local Ollama is a DEVELOPMENT runtime. Nothing here makes it production
    approved, and BEYU OS keeps the deterministic governed analyst as its
    default model runtime until an accountable human changes the governed
    registry.

.PARAMETER BaseUrl
    Ollama base URL. Default http://127.0.0.1:11434 (loopback of THIS machine).

.PARAMETER Model
    Ollama model tag to verify. Default qwen2.5:0.5b (the locally verified
    development model, ~397 MB).

.PARAMETER TimeoutSec
    HTTP timeout for the direct API probe. Default 180.

.PARAMETER SkipTests
    Skip the BEYU test suites (Ollama checks only).

.PARAMETER CheckHermes
    Also check the optional RESTRICTED Hermes agent runtime: version probe and
    the hermetic Hermes suite. No Hermes query is executed with tools.

.PARAMETER CheckCloud
    Also check whether an Ollama Cloud endpoint is configured/opt-in. This makes
    exactly ONE non-inference call (GET /api/tags) and only when the operator has
    already opted in; it NEVER sends a prompt and NEVER spends inference quota.
    Review your plan and the provider's current terms first.

.EXAMPLE
    pwsh -File scripts/noelia/ollama-smoke.ps1

.EXAMPLE
    pwsh -File scripts/noelia/ollama-smoke.ps1 -Model qwen2.5:0.5b -TimeoutSec 300

.NOTES
    Run from the repository root. See docs/noelia/NOELIA_OLLAMA_LOCAL_DEVELOPMENT.md.
#>
[CmdletBinding()]
param(
    [string] $BaseUrl = "http://127.0.0.1:11434",
    [string] $Model = "qwen2.5:0.5b",
    [int]    $TimeoutSec = 180,
    [switch] $SkipTests,
    [switch] $CheckHermes,
    [switch] $CheckCloud
)

$ErrorActionPreference = "Continue"
$script:Failures = 0
$script:Warnings = 0

function Write-Step {
    param([string] $Text)
    Write-Host "`n== $Text" -ForegroundColor Cyan
}

function Write-Ok {
    param([string] $Text)
    Write-Host "  [ OK ] $Text" -ForegroundColor Green
}

function Write-Warn2 {
    param([string] $Text)
    Write-Host "  [WARN] $Text" -ForegroundColor Yellow
    $script:Warnings++
}

function Write-Fail2 {
    param([string] $Text)
    Write-Host "  [FAIL] $Text" -ForegroundColor Red
    $script:Failures++
}

function Write-Note {
    param([string] $Text)
    Write-Host "  $Text" -ForegroundColor Gray
}

function Test-HttpStatus {
    param([string] $Uri, [int] $Seconds)
    try {
        $response = Invoke-WebRequest -Uri $Uri -Method Get -TimeoutSec $Seconds -UseBasicParsing
        return [pscustomobject]@{ Ok = $true; StatusCode = [int]$response.StatusCode; Content = $response.Content; Error = $null }
    }
    catch {
        $status = $null
        if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }
        return [pscustomobject]@{ Ok = $false; StatusCode = $status; Content = $null; Error = $_.Exception.Message }
    }
}

Write-Host "BEYU OS — NOELIA local Ollama smoke test" -ForegroundColor White
Write-Note "Repository: $(Get-Location)"
Write-Note "Endpoint:   $BaseUrl"
Write-Note "Model:      $Model"
Write-Note "Session env variables are set for THIS PowerShell session only."

# ---------------------------------------------------------------------------
Write-Step "1. Ollama availability and version"
$ollamaCommand = Get-Command ollama -ErrorAction SilentlyContinue
if ($ollamaCommand) {
    Write-Ok "ollama CLI found: $($ollamaCommand.Source)"
    try {
        $version = (& ollama --version 2>&1 | Out-String).Trim()
        if ($version) { Write-Ok "Version: $version" } else { Write-Warn2 "Could not read the Ollama version." }
    }
    catch {
        Write-Warn2 "ollama --version failed: $($_.Exception.Message)"
    }
}
else {
    Write-Warn2 "ollama CLI not found on PATH. The local API may still be running; install Ollama from https://ollama.com/download if it is not."
}

# ---------------------------------------------------------------------------
Write-Step "2. Models installed (ollama list)"
$models = @()
if ($ollamaCommand) {
    try {
        $listOutput = & ollama list 2>&1
        $listOutput | ForEach-Object { Write-Note $_ }
        foreach ($line in $listOutput) {
            if ($line -is [string] -and $line.Trim().Length -gt 0) {
                $firstColumn = ($line.Trim() -split "\s+")[0]
                if ($firstColumn -and $firstColumn -ne "NAME") { $models += $firstColumn }
            }
        }
    }
    catch {
        Write-Warn2 "ollama list failed: $($_.Exception.Message)"
    }
}
$hasModel = $models -contains $Model
if ($hasModel) {
    Write-Ok "Configured model '$Model' is installed."
}
else {
    Write-Warn2 "Configured model '$Model' was not found in 'ollama list' (if Ollama is not running this is expected)."
    Write-Note "Install it (only if you intend to use it): ollama pull $Model"
    Write-Note "Do NOT pull the ~13 GB gpt-oss model on a low-memory machine; it fails to allocate."
}

# ---------------------------------------------------------------------------
Write-Step "3. Local Ollama API checks (loopback only)"
$versionProbe = Test-HttpStatus -Uri "$BaseUrl/api/version" -Seconds $TimeoutSec
if ($versionProbe.Ok) {
    Write-Ok "GET $BaseUrl/api/version -> $($versionProbe.StatusCode)"
    Write-Note $versionProbe.Content
}
else {
    Write-Fail2 "GET $BaseUrl/api/version failed: $($versionProbe.Error)"
    Write-Note "Diagnose: is the Ollama service running? (ollama serve, or the Ollama desktop app)"
    Write-Note "Diagnose: is the endpoint correct? The default is http://127.0.0.1:11434"
    Write-Note "Do NOT expose port 11434 to a network to fix this."
}

$tagsProbe = Test-HttpStatus -Uri "$BaseUrl/api/tags" -Seconds $TimeoutSec
if ($tagsProbe.Ok) {
    try {
        $tags = $tagsProbe.Content | ConvertFrom-Json
        $tagNames = @($tags.models | ForEach-Object { $_.name })
        Write-Ok "GET $BaseUrl/api/tags -> $($tagNames.Count) model(s)"
        foreach ($name in $tagNames) { Write-Note $name }
        if ($tagNames -contains $Model) { Write-Ok "The configured model is present on the runtime." }
        else { Write-Warn2 "The configured model is NOT present on the runtime. Status would be DEGRADED, not CONNECTED." }
    }
    catch {
        Write-Warn2 "Could not parse /api/tags output: $($_.Exception.Message)"
    }
}
else {
    Write-Fail2 "GET $BaseUrl/api/tags failed: $($tagsProbe.Error)"
}

# ---------------------------------------------------------------------------
Write-Step "4. Direct chat API probe (the operator's verified request)"
$body = @{
    model    = $Model
    messages = @(
        @{
            role    = "user"
            content = "Reply with exactly: NOELIA LOCAL API TEST PASSED"
        }
    )
    stream   = $false
} | ConvertTo-Json -Depth 5

try {
    $chat = Invoke-RestMethod -Uri "$BaseUrl/api/chat" -Method Post -ContentType "application/json" -Body $body -TimeoutSec $TimeoutSec
    $content = $chat.message.content
    if ($content) {
        Write-Ok "Chat API responded."
        Write-Note "Model reported by the runtime: $($chat.model)"
        Write-Note "Response text: $content"
        if ($null -ne $chat.prompt_eval_count) { Write-Note "Token counts: in $($chat.prompt_eval_count) / out $($chat.eval_count)" }
    }
    else {
        Write-Fail2 "Chat API returned no message content."
    }
}
catch {
    Write-Fail2 "POST $BaseUrl/api/chat failed: $($_.Exception.Message)"
    Write-Note "Timeout            -> raise -TimeoutSec; a small model still needs seconds, not milliseconds."
    Write-Note "Memory exhaustion  -> the model is too large for this machine (gpt-oss ~13 GB fails on 4 GB RAM). Use a smaller model."
    Write-Note "Model not found    -> ollama pull $Model"
    Write-Note "Connection refused -> Ollama is not running or the endpoint/port is wrong."
}

# ---------------------------------------------------------------------------
Write-Step "5. BEYU development environment variables (this session only)"
$env:NOELIA_MODEL_PROVIDER = "OLLAMA"
$env:NOELIA_OLLAMA_BASE_URL = $BaseUrl
$env:NOELIA_OLLAMA_MODEL = $Model
if (-not $env:NOELIA_OLLAMA_TIMEOUT_MS)     { $env:NOELIA_OLLAMA_TIMEOUT_MS = "60000" }
if (-not $env:NOELIA_OLLAMA_MAX_ATTEMPTS)   { $env:NOELIA_OLLAMA_MAX_ATTEMPTS = "2" }
if (-not $env:NOELIA_OLLAMA_MAX_CLASSIFICATION) { $env:NOELIA_OLLAMA_MAX_CLASSIFICATION = "INTERNAL" }
Write-Note "NOELIA_MODEL_PROVIDER       = $env:NOELIA_MODEL_PROVIDER"
Write-Note "NOELIA_OLLAMA_BASE_URL      = $env:NOELIA_OLLAMA_BASE_URL"
Write-Note "NOELIA_OLLAMA_MODEL         = $env:NOELIA_OLLAMA_MODEL"
Write-Note "NOELIA_OLLAMA_TIMEOUT_MS    = $env:NOELIA_OLLAMA_TIMEOUT_MS"
Write-Note "NOELIA_OLLAMA_MAX_ATTEMPTS  = $env:NOELIA_OLLAMA_MAX_ATTEMPTS"
Write-Note "NOELIA_OLLAMA_MAX_CLASSIFICATION = $env:NOELIA_OLLAMA_MAX_CLASSIFICATION"
Write-Note "No secret is set or printed: an Ollama endpoint has no API key."
Write-Note "Clear later with:  Remove-Item Env:NOELIA_MODEL_PROVIDER, Env:NOELIA_OLLAMA_BASE_URL, Env:NOELIA_OLLAMA_MODEL"

# ---------------------------------------------------------------------------
if (-not $SkipTests) {
    Write-Step "6. Hermetic adapter tests (no Ollama required)"
    if (Test-Path "node_modules") {
        $hermetic = @(
            "tests/noelia/ollama-provider.test.ts",
            "tests/noelia/ollama-http-integration.test.ts",
            "tests/noelia/ollama-gateway.test.ts"
        )
        & npx vitest run $hermetic[0] $hermetic[1] $hermetic[2]
        if ($LASTEXITCODE -eq 0) { Write-Ok "Hermetic Ollama suites passed." } else { Write-Fail2 "Hermetic Ollama suites reported failures." }
    }
    else {
        Write-Warn2 "node_modules is missing; run: npm ci"
    }

    Write-Step "7. Opt-in LIVE smoke test (real inference against your Ollama)"
    $env:NOELIA_OLLAMA_LIVE_TEST = "1"
    # Live suites live OUTSIDE the default include (`*.live.ts`) so the normal
    # run never reports them as skipped; this config collects them explicitly.
    & npx vitest run --config vitest.live.config.ts tests/noelia/ollama-live-smoke.live.ts
    if ($LASTEXITCODE -eq 0) {
        Write-Ok "Live smoke test passed: a real inference round-trip completed."
        Write-Note "Reported status is evidence-based: CONNECTED then VERIFIED, and COMPLETED for the governed generation."
    }
    else {
        Write-Fail2 "Live smoke test failed. Ollama is not reachable/usable for the configured model right now."
    }
    $env:NOELIA_OLLAMA_LIVE_TEST = $null
}

if ($CheckHermes) {
    Write-Step "8. RESTRICTED Hermes agent runtime (optional; disabled by default)"
    $hermesCommand = Get-Command "hermes-agent" -ErrorAction SilentlyContinue
    if ($hermesCommand) {
        Write-Ok "hermes-agent found: $($hermesCommand.Source)"
        try {
            $hermesVersion = (& hermes-agent --version 2>$null | Select-Object -First 1)
            if ($hermesVersion) { Write-Ok "Version: $hermesVersion" } else { Write-Warn2 "Could not read the Hermes version." }
        }
        catch {
            Write-Warn2 "hermes-agent --version failed. Check the CLI installation before enabling the runtime."
        }
    }
    else {
        Write-Warn2 "hermes-agent is not on PATH. The Hermes runtime stays NOT_CONNECTED; nothing else is affected."
        Write-Note "Install (operator action, optional): see docs/noelia/NOELIA_HERMES_RESTRICTED_RUNTIME.md."
    }

    Write-Note "Restricted posture: one bounded query, EVERY toolset disabled, no autonomous loop,"
    Write-Note "no shell, no filesystem, no database, no network tools. Agent prose is never an action receipt."

    if (Test-Path "node_modules") {
        & npx vitest run tests/noelia/hermes-runtime.test.ts
        if ($LASTEXITCODE -eq 0) { Write-Ok "Hermetic Hermes suite passed (mocked runner; no agent process started)." }
        else { Write-Fail2 "Hermetic Hermes suite reported failures." }
    }
    else {
        Write-Warn2 "node_modules is missing; run: npm ci"
    }
}

if ($CheckCloud) {
    Write-Step "9. Ollama Cloud availability (OPT-IN, non-inference check only)"
    $cloudOptIn = $env:NOELIA_OLLAMA_CLOUD_OPT_IN
    $cloudKey = $env:NOELIA_OLLAMA_API_KEY
    if ($cloudOptIn -ne "1") {
        Write-Note "Cloud is not opted in (NOELIA_OLLAMA_CLOUD_OPT_IN is not 1). No request was made."
    }
    elseif (-not $cloudKey) {
        Write-Warn2 "Cloud is opted in but NOELIA_OLLAMA_API_KEY is not set in this session. No request was made."
    }
    else {
        try {
            # GET /api/tags lists models. It sends NO prompt and consumes NO
            # inference quota. The key is sent as a header and never printed.
            $cloudTags = Invoke-RestMethod -Uri "https://ollama.com/api/tags" -Headers @{ Authorization = "Bearer $cloudKey" } -TimeoutSec 60
            $cloudCount = @($cloudTags.models).Count
            Write-Ok "Cloud endpoint answered; it advertises $cloudCount model(s). No inference was performed."
            Write-Note "Cost note: listing is not inference, but pricing/quota are controlled by the provider."
            Write-Note "BEYU OS never uses cloud automatically and never falls back to it after a local failure."
        }
        catch {
            $status = $null
            if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }
            Write-Warn2 "Cloud endpoint did not answer successfully (status: $status). The runtime stays NOT_CONNECTED/FAILED."
            Write-Note "A 401/402/429 means authentication, payment or rate limiting. Do NOT retry blindly."
        }
    }
}

# ---------------------------------------------------------------------------
Write-Step "Summary and boundaries"
if ($script:Failures -eq 0) {
    Write-Ok "No failures detected ($script:Warnings warning(s))."
}
else {
    Write-Fail2 "$script:Failures check(s) failed ($script:Warnings warning(s))."
}
Write-Note "Local development only: a BEYU backend running anywhere other than this machine"
Write-Note "cannot reach $BaseUrl. Localhost is loopback of the process that makes the call."
Write-Note "Never expose Ollama's port 11434 to a network or create a public tunnel."
Write-Note "The deterministic governed analyst remains BEYU's default runtime; Ollama is opt-in."
Write-Note "Cloud inference is opt-in and never automatic; no paid fallback exists in BEYU OS."
Write-Note "Hermes (if checked) runs with every toolset disabled and cannot execute an OS action."

exit $(if ($script:Failures -eq 0) { 0 } else { 1 })
