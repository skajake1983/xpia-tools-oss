// XPIA Tools — Azure Infrastructure
// Deploys: App Service, Azure Cosmos DB, Communication Services, Storage Account

targetScope = 'resourceGroup'

@description('Base name for all resources')
param appName string = 'xpia-tools'

@description('Azure region')
param location string = resourceGroup().location

@description('App Service Plan SKU')
@allowed(['B1', 'B2', 'S1', 'P1v3'])
param appServiceSku string = 'B1'

@secure()
@description('JWT signing secret (64 chars)')
param jwtSecret string

@secure()
@description('JWT refresh token secret (64 chars)')
param jwtRefreshSecret string

@secure()
@description('AES-256 encryption key for API keys (64-char hex)')
param encryptionKey string

@description('Client URL for CORS (e.g. https://www.your-domain.example)')
param clientUrl string = 'https://${appName}.azurewebsites.net'

@description('Public pages domain (e.g. https://pages.your-domain.example)')
param publicPagesDomain string = ''

@description('Application Insights resource ID (for availability tests)')
param appInsightsId string = ''

@description('Email address for monitoring alerts')
param alertEmail string = ''

// ──── Modules ────

module cosmos 'modules/cosmos.bicep' = {
  name: 'cosmos-deployment'
  params: {
    appName: appName
    location: location
  }
}

module storage 'modules/storage.bicep' = {
  name: 'storage-deployment'
  params: {
    appName: appName
    location: location
  }
}

module communication 'modules/communication.bicep' = {
  name: 'communication-deployment'
  params: {
    appName: appName
    // ACS uses 'global' data location
  }
}

module appService 'modules/app-service.bicep' = {
  name: 'app-service-deployment'
  params: {
    appName: appName
    location: location
    sku: appServiceSku
    cosmosEndpoint: cosmos.outputs.endpoint
    cosmosKey: cosmos.outputs.primaryKey
    cosmosDatabaseName: cosmos.outputs.databaseName
    jwtSecret: jwtSecret
    jwtRefreshSecret: jwtRefreshSecret
    encryptionKey: encryptionKey
    clientUrl: clientUrl
    storageConnectionString: storage.outputs.connectionString
    communicationConnectionString: communication.outputs.connectionString
    emailSenderAddress: communication.outputs.emailSenderAddress
    publicPagesDomain: publicPagesDomain
  }
}

module monitoring 'modules/monitoring.bicep' = if (appInsightsId != '' && alertEmail != '') {
  name: 'monitoring-deployment'
  params: {
    appName: appName
    location: location
    appInsightsId: appInsightsId
    alertEmail: alertEmail
  }
}

// ──── Outputs ────

output appServiceUrl string = appService.outputs.appUrl
output appServiceName string = appService.outputs.appName
output cosmosAccountName string = cosmos.outputs.accountName
output cosmosDatabaseName string = cosmos.outputs.databaseName
output storageAccountName string = storage.outputs.accountName
output storageStaticWebsiteUrl string = storage.outputs.staticWebsiteUrl
output communicationServiceName string = communication.outputs.serviceName
