# OpenMemory Startup Script
# Checks if OpenMemory is running, starts it if not

$openMemoryUrl = "http://localhost:8080/health"
$openMemoryPath = "D:\AI Projects\OpenMemory\backend"

Write-Host " Checking OpenMemory AI Memory System..." -ForegroundColor Cyan

try {
    $response = Invoke-RestMethod -Uri $openMemoryUrl -TimeoutSec 2 -ErrorAction Stop
    if ($response.ok) {
        Write-Host " OpenMemory is already running!" -ForegroundColor Green
        Write-Host "   Provider: $($response.embedding.provider)" -ForegroundColor Gray
        Write-Host "   Version: $($response.version)" -ForegroundColor Gray
    }
} catch {
    Write-Host "  OpenMemory is not running. Starting it now..." -ForegroundColor Yellow
    Write-Host ""
    
    # Check if the path exists
    if (Test-Path $openMemoryPath) {
        Write-Host " Found OpenMemory at: $openMemoryPath" -ForegroundColor Gray

        # Start OpenMemory in a new minimized PowerShell window
        $processInfo = New-Object System.Diagnostics.ProcessStartInfo
        $processInfo.FileName = "powershell.exe"
        $processInfo.Arguments = "-NoExit -Command ""cd '$openMemoryPath'; npm run dev"""
        $processInfo.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Minimized
        [void][System.Diagnostics.Process]::Start($processInfo)

        Write-Host " Starting OpenMemory backend..." -ForegroundColor Cyan
        Write-Host "   Waiting for server to initialize..." -ForegroundColor Gray

        # Wait for server to start (max 30 seconds)
        $maxAttempts = 30
        $attempt = 0
        $started = $false

        while ($attempt -lt $maxAttempts -and -not $started) {
            Start-Sleep -Seconds 1
            $attempt++

            try {
                $testResponse = Invoke-RestMethod -Uri $openMemoryUrl -TimeoutSec 1 -ErrorAction Stop
                if ($testResponse.ok) {
                    $started = $true
                    Write-Host ""
                    Write-Host " OpenMemory started successfully!" -ForegroundColor Green
                    Write-Host "   Server: http://localhost:8080" -ForegroundColor Gray
                    Write-Host "   Database: shield-ai-memory.sqlite" -ForegroundColor Gray
                    Write-Host "   Privacy:  100% Local" -ForegroundColor Gray
                }
            } catch {
                Write-Host "." -NoNewline -ForegroundColor Gray
            }
        }

        if (-not $started) {
            Write-Host ""
            Write-Host " OpenMemory failed to start within 30 seconds" -ForegroundColor Red
            Write-Host "   Please check the OpenMemory console for errors" -ForegroundColor Yellow
            Write-Host "   Manual start: cd '$openMemoryPath'; npm run dev" -ForegroundColor Gray
        }
    } else {
        Write-Host " OpenMemory directory not found at: $openMemoryPath" -ForegroundColor Red
        Write-Host "   Please clone OpenMemory first:" -ForegroundColor Yellow
        Write-Host "   git clone https://github.com/CaviraOSS/OpenMemory.git" -ForegroundColor Gray
    }
}

Write-Host ""
Write-Host " Documentation:" -ForegroundColor Cyan
Write-Host "   Quick Start: AI-MEMORY-README.md" -ForegroundColor Gray
Write-Host "   Full Guide: docs/AI_MEMORY_SETUP.md" -ForegroundColor Gray
Write-Host ""
