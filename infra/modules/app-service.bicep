// Azure App Service Plan + Web App

@description('Base app name')
param appName string

@description('Azure region')
param location string

@description('App Service Plan SKU')
param sku string

@secure()
@description('CosmosDB endpoint URL')
param cosmosEndpoint string

@secure()
@description('CosmosDB primary key')
param cosmosKey string

@description('CosmosDB database name')
param cosmosDatabaseName string

@secure()
param jwtSecret string

@secure()
param jwtRefreshSecret string

@secure()
param encryptionKey string

param clientUrl string

@secure()
param storageConnectionString string

@secure()
param communicationConnectionString string

param emailSenderAddress string
param publicPagesDomain string

// ──── App Service Plan ────

resource appServicePlan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: '${appName}-plan'
  location: location
  kind: 'linux'
  sku: {
    name: sku
  }
  properties: {
    reserved: true // Required for Linux
  }
}

// ──── App Service ────

resource webApp 'Microsoft.Web/sites@2023-12-01' = {
  name: appName
  location: location
  properties: {
    serverFarmId: appServicePlan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'NODE|20-lts'
      alwaysOn: true
      minTlsVersion: '1.2'
      ftpsState: 'Disabled'
      http20Enabled: true
      appCommandLine: 'node server/dist/server/src/index.js'
      appSettings: [
        { name: 'NODE_ENV', value: 'production' }
        { name: 'PORT', value: '8080' }
        { name: 'COSMOS_ENDPOINT', value: cosmosEndpoint }
        { name: 'COSMOS_KEY', value: cosmosKey }
        { name: 'COSMOS_DATABASE', value: cosmosDatabaseName }
        { name: 'JWT_SECRET', value: jwtSecret }
        { name: 'JWT_REFRESH_SECRET', value: jwtRefreshSecret }
        { name: 'JWT_EXPIRES_IN', value: '15m' }
        { name: 'JWT_REFRESH_EXPIRES_IN', value: '7d' }
        { name: 'ENCRYPTION_KEY', value: encryptionKey }
        { name: 'CLIENT_URL', value: clientUrl }
        { name: 'AZURE_STORAGE_CONNECTION_STRING', value: storageConnectionString }
        { name: 'AZURE_STORAGE_CONTAINER', value: '$web' }
        { name: 'PUBLIC_PAGES_DOMAIN', value: publicPagesDomain }
        { name: 'AZURE_COMMUNICATION_CONNECTION_STRING', value: communicationConnectionString }
        { name: 'EMAIL_SENDER_ADDRESS', value: emailSenderAddress }
        { name: 'WEBSITE_NODE_DEFAULT_VERSION', value: '~20' }
        { name: 'SCM_DO_BUILD_DURING_DEPLOYMENT', value: 'true' }
      ]
    }
  }
}

output appUrl string = 'https://${webApp.properties.defaultHostName}'
output appName string = webApp.name
