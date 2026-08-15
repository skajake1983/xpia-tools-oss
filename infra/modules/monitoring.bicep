// Azure Monitoring — Availability Tests + Alerts (zero-cost tier)
//
// Uses standard URL ping tests (free on Basic plan) and metric alerts
// against the App Service's built-in metrics (no extra resource cost).

@description('Base app name')
param appName string

@description('Azure region')
param location string

@description('App Insights resource ID')
param appInsightsId string

@description('Email address for alert notifications')
param alertEmail string

// ──── Action Group (email notification) ────

resource actionGroup 'Microsoft.Insights/actionGroups@2023-01-01' = {
  name: '${appName}-alerts-ag'
  location: 'global'
  properties: {
    groupShortName: 'xpia-alerts'
    enabled: true
    emailReceivers: [
      {
        name: 'Admin'
        emailAddress: alertEmail
        useCommonAlertSchema: true
      }
    ]
  }
}

// ──── Availability (URL Ping) Test ────

resource availabilityTest 'Microsoft.Insights/webtests@2022-06-15' = {
  name: '${appName}-health-ping'
  location: location
  tags: {
    'hidden-link:${appInsightsId}': 'Resource'
  }
  kind: 'ping'
  properties: {
    SyntheticMonitorId: '${appName}-health-ping'
    Name: '${appName} Health Check'
    Enabled: true
    Frequency: 300 // every 5 minutes
    Timeout: 30
    Kind: 'ping'
    RetryEnabled: true
    Locations: [
      { Id: 'us-va-ash-azr' }     // East US
      { Id: 'us-ca-sjc-azr' }     // West US
      { Id: 'emea-gb-db3-azr' }   // North Europe
      { Id: 'emea-nl-ams-azr' }   // West Europe
      { Id: 'apac-jp-kaw-azr' }   // Japan East
    ]
    Configuration: {
      WebTest: '<WebTest Name="${appName}-health" Id="${guid(appName, 'healthping')}" Enabled="True" Timeout="30" xmlns="http://microsoft.com/schemas/VisualStudio/TeamTest/2010"><Items><Request Method="GET" Version="1.1" Url="https://${appName}.azurewebsites.net/api/health" ThinkTime="0" Timeout="30" ParseDependentRequests="False" FollowRedirects="True" RecordResult="True" Cache="False" ResponseTimeGoal="0" Encoding="utf-8" ExpectedHttpStatusCode="200" /></Items></WebTest>'
    }
  }
}

// ──── Availability Alert — fires when <100% availability from 2+ locations ────

resource availabilityAlert 'Microsoft.Insights/metricAlerts@2018-03-01' = {
  name: '${appName}-availability-alert'
  location: 'global'
  properties: {
    description: 'Health endpoint unavailable from 2+ test locations'
    severity: 1
    enabled: true
    scopes: [
      appInsightsId
    ]
    evaluationFrequency: 'PT5M'
    windowSize: 'PT5M'
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.WebtestLocationAvailabilityCriteria'
      webTestId: availabilityTest.id
      componentId: appInsightsId
      failedLocationCount: 2
    }
    actions: [
      {
        actionGroupId: actionGroup.id
      }
    ]
  }
}

// ──── Server Error (5xx) Alert ────

resource serverErrorAlert 'Microsoft.Insights/metricAlerts@2018-03-01' = {
  name: '${appName}-5xx-alert'
  location: 'global'
  properties: {
    description: 'HTTP 5xx errors detected on App Service'
    severity: 2
    enabled: true
    scopes: [
      resourceId('Microsoft.Web/sites', appName)
    ]
    evaluationFrequency: 'PT5M'
    windowSize: 'PT5M'
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          name: 'Http5xx'
          metricName: 'Http5xx'
          metricNamespace: 'Microsoft.Web/sites'
          operator: 'GreaterThan'
          threshold: 0
          timeAggregation: 'Total'
          criterionType: 'StaticThresholdCriterion'
        }
      ]
    }
    actions: [
      {
        actionGroupId: actionGroup.id
      }
    ]
  }
}
