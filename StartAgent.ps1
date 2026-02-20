# ========================================
# CLEAN OLLAMA + BRAVE WORKFLOW
# ========================================

$modelName = "phi3:mini"
$projectPath = $PSScriptRoot
$memoryFolder = "$projectPath\MemoryFiles"
$chatFile = "$projectPath\chat.html"
$serverPort = 3000
$bravePath = "C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe"

function Test-Port($port) {
    return (Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue)
}

Write-Host "`nChecking Ollama..."

# --- Start Ollama if needed ---
if (-not (Test-Port 11434)) {
    Write-Host "Starting Ollama..."
    Start-Process "ollama" -ArgumentList "serve"
    Start-Sleep -Seconds 3
} else {
    Write-Host "Ollama already running."
}

# --- Optional memory ingestion ---
if (Test-Path $memoryFolder) {
    Get-ChildItem -Path $memoryFolder -File | ForEach-Object {
        $filePath = $_.FullName
        Write-Host "Ingesting: $filePath"
        Invoke-WebRequest -Uri "http://127.0.0.1:11434/api/generate" `
                          -Method POST `
                          -Body ("{`"model`": `"$modelName`", `"prompt`": `"Loaded memory file: $filePath`", `"stream`": false}") `
                          -ContentType "application/json" | Out-Null
    }
}

# --- Start local web server ---
if (-not (Test-Port $serverPort)) {
    Write-Host "Starting local web server..."
    Start-Process "powershell" `
        -ArgumentList "-NoExit", "-Command", "cd '$projectPath'; python -m http.server $serverPort"
    Start-Sleep -Seconds 2
}

# --- Open Brave using dynamic file reference ---
if (Test-Path $bravePath) {
    Write-Host "Opening Brave..."
    Start-Process $bravePath "http://127.0.0.1:$serverPort/$(Split-Path $chatFile -Leaf)"
} else {
    Start-Process "http://127.0.0.1:$serverPort/$(Split-Path $chatFile -Leaf)"
}

Write-Host "`nSystem ready using model: $modelName"
