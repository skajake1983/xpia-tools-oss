/**
 * Application Insights telemetry setup.
 * Must be required BEFORE other imports in the entry point.
 *
 * Uses the free tier with a 50 MB daily cap and 25% sampling
 * to stay within the 5 GB/month free allowance.
 */
const connectionString = process.env.APPLICATIONINSIGHTS_CONNECTION_STRING;

if (connectionString) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const appInsights = require('applicationinsights') as typeof import('applicationinsights');

  appInsights
    .setup(connectionString)
    .setAutoCollectRequests(true)
    .setAutoCollectPerformance(true, false) // extended metrics off
    .setAutoCollectExceptions(true)
    .setAutoCollectDependencies(true)
    .setAutoCollectConsole(true, false) // console.log → traces, but not console.error duplicate
    .setSendLiveMetrics(false) // avoid extra cost
    .start();

  // 25% sampling to reduce ingestion volume
  appInsights.defaultClient.config.samplingPercentage = 25;

  console.log('[Telemetry] Application Insights initialised (25% sampling)');
} else {
  console.log('[Telemetry] APPLICATIONINSIGHTS_CONNECTION_STRING not set — telemetry disabled');
}
