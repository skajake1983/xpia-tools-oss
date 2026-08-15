<#
.SYNOPSIS
    XPIA Tools — Full Azure Deployment Script
.DESCRIPTION
    Creates all Azure resources via Bicep and deploys the application.
    Prerequisites: Azure CLI (az) installed and logged in.
#>

param(
    [string]$ResourceGroup = "rg-xpia-tools-prod",
    [string]$Location = "eastus2",
    [string]$AppName = "xpia-tools"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Write-Host "`n=== XPIA Tools — Azure Deployment ===" -ForegroundColor Cyan

# ── Prerequisites ──

Write-Host "`nChecking prerequisites..."
if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
    Write-Error "Azure CLI (az) is required. Install from https://aka.ms/installazurecli"
}
try {
    $account = az account show 2>&1 | ConvertFrom-Json
    Write-Host "  Subscription: $($account.name) ($($account.id))" -ForegroundColor Green
} catch {
    Write-Error "Please run 'az login' first."
}

# ── Generate secrets ──

Write-Host "`nGenerating secrets..."
$jwtSecret = -join ((1..64) | ForEach-Object { [char](Get-Random -Minimum 33 -Maximum 126) })
$jwtRefreshSecret = -join ((1..64) | ForEach-Object { [char](Get-Random -Minimum 33 -Maximum 126) })
$encryptionKey = -join ((1..64) | ForEach-Object { '{0:x}' -f (Get-Random -Minimum 0 -Maximum 16) })
Write-Host "  Secrets generated (stored only in Azure)" -ForegroundColor Green

# ── Create Resource Group ──

Write-Host "`nCreating resource group: $ResourceGroup..."
az group create --name $ResourceGroup --location $Location --output none
Write-Host "  Done" -ForegroundColor Green

# ── Deploy Bicep ──

Write-Host "`nDeploying infrastructure (this takes 3-5 minutes)..."
$deployResult = az deployment group create `
    --resource-group $ResourceGroup `
    --template-file "$PSScriptRoot\..\infra\main.bicep" `
    --parameters `
        appName=$AppName `
        location=$Location `
        jwtSecret=$jwtSecret `
        jwtRefreshSecret=$jwtRefreshSecret `
        encryptionKey=$encryptionKey `
        clientUrl="https://${AppName}.azurewebsites.net" `
    --output json | ConvertFrom-Json

if ($LASTEXITCODE -ne 0) {
    Write-Error "Bicep deployment failed."
}
Write-Host "  Infrastructure deployed" -ForegroundColor Green

# ── Extract outputs ──

$outputs = $deployResult.properties.outputs
$appUrl = $outputs.appServiceUrl.value
$cosmosAccount = $outputs.cosmosAccountName.value
$storageName = $outputs.storageAccountName.value

Write-Host "`n=== Deployment Outputs ===" -ForegroundColor Cyan
Write-Host "  App URL:        $appUrl"
Write-Host "  Cosmos DB:      $cosmosAccount"
Write-Host "  Storage:        $storageName"

# ── Enable static website on storage account ──

Write-Host "`nEnabling static website on storage account..."
az storage blob service-properties update `
    --account-name $storageName `
    --static-website `
    --index-document "index.html" `
    --404-document "404.html" `
    --output none 2>$null
Write-Host "  Done" -ForegroundColor Green

# ── Upload static root + error pages to $web container ──

$storageKey = (az storage account keys list --account-name $storageName --query '[0].value' -o tsv)

Write-Host "`nUploading static pages (index.html, 404.html) to `$web container..."
az storage blob upload `
    --account-name $storageName `
    --account-key $storageKey `
    --container-name '$web' `
    --name "index.html" `
    --file "static-pages/index.html" `
    --content-type "text/html; charset=utf-8" `
    --overwrite `
    --output none 2>$null

az storage blob upload `
    --account-name $storageName `
    --account-key $storageKey `
    --container-name '$web' `
    --name "404.html" `
    --file "static-pages/404.html" `
    --content-type "text/html; charset=utf-8" `
    --overwrite `
    --output none 2>$null
Write-Host "  Done" -ForegroundColor Green

# ── Link email domain to communication service ──

Write-Host "`nLinking email domain to communication service..."
$emailDomainId = az communication email domain list `
    --email-service-name "${AppName}-email" `
    --resource-group $ResourceGroup `
    --query "[0].id" -o tsv 2>$null

if ($emailDomainId) {
    az communication update `
        --name "${AppName}-comm" `
        --resource-group $ResourceGroup `
        --linked-domains $emailDomainId `
        --output none 2>$null
    Write-Host "  Done" -ForegroundColor Green
} else {
    Write-Host "  Skipped — link manually after provisioning completes" -ForegroundColor Yellow
}

# ── Build & Deploy Code ──

Write-Host "`nBuilding application..."
Push-Location "$PSScriptRoot\.."
try {
    npm run install:all 2>&1 | Out-Null
    npm run build 2>&1 | Out-Null
    Write-Host "  Build complete" -ForegroundColor Green

    # Create deployment zip
    Write-Host "`nCreating deployment package..."
    $zipPath = "$PSScriptRoot\..\deploy.zip"
    if (Test-Path $zipPath) { Remove-Item $zipPath }

    # Include: server/dist, server/package.json, server/node_modules,
    #          client/dist, package.json, shared/
    $stagingDir = "$PSScriptRoot\..\deploy-staging"
    if (Test-Path $stagingDir) { Remove-Item $stagingDir -Recurse -Force }
    New-Item $stagingDir -ItemType Directory | Out-Null

    # Copy deployment files
    Copy-Item "$PSScriptRoot\..\package.json" "$stagingDir\"
    Copy-Item "$PSScriptRoot\..\server" "$stagingDir\server" -Recurse -Exclude "node_modules", "*.db", ".env", "data"
    Copy-Item "$PSScriptRoot\..\client\dist" "$stagingDir\client\dist" -Recurse
    Copy-Item "$PSScriptRoot\..\shared" "$stagingDir\shared" -Recurse

    # Remove test files and source from server (keep dist + package files)
    if (Test-Path "$stagingDir\server\src") { Remove-Item "$stagingDir\server\src" -Recurse -Force }
    if (Test-Path "$stagingDir\server\vitest.config.ts") { Remove-Item "$stagingDir\server\vitest.config.ts" }
    if (Test-Path "$stagingDir\server\tsconfig.json") { Remove-Item "$stagingDir\server\tsconfig.json" }

    Compress-Archive -Path "$stagingDir\*" -DestinationPath $zipPath -Force
    Remove-Item $stagingDir -Recurse -Force
    Write-Host "  Package created: deploy.zip" -ForegroundColor Green

    # Deploy to App Service
    Write-Host "`nDeploying to App Service (this takes 1-2 minutes)..."
    az webapp deploy `
        --resource-group $ResourceGroup `
        --name $AppName `
        --src-path $zipPath `
        --type zip `
        --output none
    Write-Host "  Deployed" -ForegroundColor Green

    # Cleanup zip
    Remove-Item $zipPath -ErrorAction SilentlyContinue

} finally {
    Pop-Location
}

# ── Summary ──

Write-Host "`n=== Deployment Complete ===" -ForegroundColor Green
Write-Host ""
Write-Host "  Application:  $appUrl"
Write-Host "  Cosmos DB:    $cosmosAccount"
Write-Host "  Storage:      https://${storageName}.z13.web.core.windows.net"
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Visit $appUrl — register the first user (auto-superadmin)"
Write-Host "  2. Add LLM API keys in Admin > API Keys"
Write-Host "  3. Configure custom domain: CNAME <your-domain> -> ${AppName}.azurewebsites.net"
Write-Host "  4. Enable App Service managed certificate for the custom domain"
Write-Host ""
