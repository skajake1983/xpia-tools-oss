// Azure Communication Services + Email

@description('Base app name')
param appName string

var communicationName = '${appName}-comm'
var emailServiceName = '${appName}-email'

// ──── Communication Service ────

resource communicationService 'Microsoft.Communication/communicationServices@2023-06-01-preview' = {
  name: communicationName
  location: 'global'
  properties: {
    dataLocation: 'United States'
  }
}

// ──── Email Communication Service ────

resource emailService 'Microsoft.Communication/emailServices@2023-06-01-preview' = {
  name: emailServiceName
  location: 'global'
  properties: {
    dataLocation: 'United States'
  }
}

// ──── Azure-managed email domain (*.azurecomm.net) ────

resource emailDomain 'Microsoft.Communication/emailServices/domains@2023-06-01-preview' = {
  parent: emailService
  name: 'AzureManagedDomain'
  location: 'global'
  properties: {
    domainManagement: 'AzureManaged'
    userEngagementTracking: 'Disabled'
  }
}

// ──── Link the email domain to the communication service ────

resource commWithLinkedDomains 'Microsoft.Communication/communicationServices@2023-06-01-preview' = {
  name: communicationName
  location: 'global'
  properties: {
    dataLocation: 'United States'
    linkedDomains: [
      emailDomain.id
    ]
  }
  dependsOn: [
    communicationService
    emailDomain
  ]
}

output serviceName string = communicationService.name
output connectionString string = communicationService.listKeys().primaryConnectionString
output emailSenderAddress string = 'DoNotReply@${emailDomain.properties.mailFromSenderDomain}'
