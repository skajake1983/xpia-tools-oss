#!/bin/bash
# Azure deployment setup script
# Run this once to create Azure resources and configure deployment

set -e

# Configuration — update these
RESOURCE_GROUP="xpia-tools-rg"
LOCATION="eastus2"
APP_NAME="xpia-tools"
SKU="B1"

echo "=== XPIA Tools — Azure Deployment Setup ==="
echo ""

# Check for az CLI
if ! command -v az &> /dev/null; then
    echo "Error: Azure CLI (az) is required. Install from https://aka.ms/installazurecli"
    exit 1
fi

# Login check
echo "Checking Azure login..."
az account show > /dev/null 2>&1 || { echo "Please run 'az login' first."; exit 1; }

SUBSCRIPTION=$(az account show --query name -o tsv)
echo "Using subscription: $SUBSCRIPTION"
echo ""

# Create resource group
echo "Creating resource group: $RESOURCE_GROUP..."
az group create --name "$RESOURCE_GROUP" --location "$LOCATION" --output none

# Generate JWT secret
JWT_SECRET=$(openssl rand -base64 64 | tr -d '\n')

# Deploy ARM template
echo "Deploying Azure resources..."
az deployment group create \
    --resource-group "$RESOURCE_GROUP" \
    --template-file ./azure/azuredeploy.json \
    --parameters appName="$APP_NAME" sku="$SKU" jwtSecret="$JWT_SECRET" \
    --output none

echo ""
echo "=== Deployment Complete ==="
echo ""
APP_URL=$(az webapp show --name "$APP_NAME" --resource-group "$RESOURCE_GROUP" --query defaultHostName -o tsv)
echo "App URL: https://$APP_URL"
echo ""

# Get publish profile for GitHub Actions
echo "Fetching publish profile for GitHub Actions..."
PUBLISH_PROFILE=$(az webapp deployment list-publishing-profiles \
    --name "$APP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --xml)
echo ""
echo "Add this as a GitHub Actions secret named AZURE_WEBAPP_PUBLISH_PROFILE:"
echo "$PUBLISH_PROFILE" | head -c 200
echo "..."
echo ""
echo "Full profile saved to: .azure-publish-profile.xml (DO NOT COMMIT THIS FILE)"
echo "$PUBLISH_PROFILE" > .azure-publish-profile.xml

echo ""
echo "Next steps:"
echo "1. Add AZURE_WEBAPP_PUBLISH_PROFILE secret to your GitHub repo"
echo "2. Push to main branch to trigger deployment"
echo "3. Or deploy manually: npm run build && az webapp deploy --src-path deploy.zip"
