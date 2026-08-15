// Azure Cosmos DB (NoSQL API) — Free Tier
// Database: xpia-tools, 7 containers with partition keys, TTL, and indexing policies

@description('Base app name')
param appName string

@description('Azure region')
param location string

var accountName = '${appName}-cosmos'
var databaseName = appName

// ──── Cosmos DB Account (Free Tier) ────

resource cosmosAccount 'Microsoft.DocumentDB/databaseAccounts@2024-05-15' = {
  name: accountName
  location: location
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    enableFreeTier: false
    consistencyPolicy: {
      defaultConsistencyLevel: 'Session'
    }
    locations: [
      {
        locationName: location
        failoverPriority: 0
      }
    ]
    capabilities: [
      { name: 'EnableServerless' }
    ]
    minimalTlsVersion: 'Tls12'
    publicNetworkAccess: 'Enabled'
    disableLocalAuth: false
  }
}

// ──── Database ────

resource cosmosDatabase 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-05-15' = {
  parent: cosmosAccount
  name: databaseName
  properties: {
    resource: {
      id: databaseName
    }
  }
}

// ──── Containers ────

// users — user profiles with embedded limits
resource usersContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  parent: cosmosDatabase
  name: 'users'
  properties: {
    resource: {
      id: 'users'
      partitionKey: { paths: ['/id'], kind: 'Hash' }
    }
  }
}

// auth — tokens, sessions, trusted devices (TTL-enabled, per-item)
resource authContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  parent: cosmosDatabase
  name: 'auth'
  properties: {
    resource: {
      id: 'auth'
      partitionKey: { paths: ['/userId'], kind: 'Hash' }
      defaultTtl: -1
    }
  }
}

// config — providers, models, invites, prompt templates
resource configContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  parent: cosmosDatabase
  name: 'config'
  properties: {
    resource: {
      id: 'config'
      partitionKey: { paths: ['/id'], kind: 'Hash' }
      indexingPolicy: {
        includedPaths: [{ path: '/*' }]
        excludedPaths: [
          { path: '/"systemPrompt"/?' }
          { path: '/"userPrompt"/?' }
        ]
      }
    }
  }
}

// api-keys — encrypted API keys
resource apiKeysContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  parent: cosmosDatabase
  name: 'api-keys'
  properties: {
    resource: {
      id: 'api-keys'
      partitionKey: { paths: ['/userId'], kind: 'Hash' }
      indexingPolicy: {
        includedPaths: [{ path: '/*' }]
        excludedPaths: [
          { path: '/"encryptedKey"/?' }
          { path: '/"keyIv"/?' }
          { path: '/"keyTag"/?' }
        ]
      }
    }
  }
}

// usage — usage log entries
resource usageContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  parent: cosmosDatabase
  name: 'usage'
  properties: {
    resource: {
      id: 'usage'
      partitionKey: { paths: ['/userId'], kind: 'Hash' }
      indexingPolicy: {
        includedPaths: [{ path: '/*' }]
        excludedPaths: [
          { path: '/"promptMessages"/?' }
          { path: '/"responseText"/?' }
          { path: '/"requestMeta"/?' }
        ]
      }
    }
  }
}

// content — generated documents and payloads
resource contentContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  parent: cosmosDatabase
  name: 'content'
  properties: {
    resource: {
      id: 'content'
      partitionKey: { paths: ['/userId'], kind: 'Hash' }
    }
  }
}

// pages — XPIA pages
resource pagesContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  parent: cosmosDatabase
  name: 'pages'
  properties: {
    resource: {
      id: 'pages'
      partitionKey: { paths: ['/userId'], kind: 'Hash' }
    }
  }
}

// ──── Outputs ────

output endpoint string = cosmosAccount.properties.documentEndpoint
output accountName string = cosmosAccount.name

#disable-next-line outputs-should-not-contain-secrets
output primaryKey string = cosmosAccount.listKeys().primaryMasterKey
output databaseName string = databaseName
