// Azure Storage Account (Blob + Static Website)

@description('Base app name')
param appName string

@description('Azure region')
param location string

// Storage account names must be 3-24 lowercase alphanumeric
var storageAccountName = replace(toLower('${appName}stor'), '-', '')

// ──── Storage Account ────

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountName
  location: location
  kind: 'StorageV2'
  sku: {
    name: 'Standard_LRS'
  }
  properties: {
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    allowBlobPublicAccess: true  // Required for static website hosting
  }
}

// ──── Blob Services ────

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storageAccount
  name: 'default'
}

// ──── $web container (auto-created by static website, but declare for lifecycle) ────

resource webContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: '$web'
  properties: {
    publicAccess: 'Blob'
  }
}

// ──── documents container (generated DOCX, PDF, RTF, QR images) ────

resource documentsContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: 'documents'
  properties: {
    publicAccess: 'None'
  }
}

// Note: Static website hosting must be enabled via Azure CLI after deployment:
//   az storage blob service-properties update --account-name <name> --static-website --index-document index.html

output accountName string = storageAccount.name
output connectionString string = 'DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};AccountKey=${storageAccount.listKeys().keys[0].value};EndpointSuffix=core.windows.net'
output staticWebsiteUrl string = 'https://${storageAccount.name}.z13.web.core.windows.net'
