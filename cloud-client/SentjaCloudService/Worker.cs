using SentjaCloudService.Services;
using SentjaShared.ApiClient;
using SentjaShared.Storage;

namespace SentjaCloudService;

public class Worker(
    ILogger<Worker> logger,
    SentjaApiClient apiClient,
    HeartbeatService heartbeatService,
    PolicyService policyService,
    SyncManager syncManager) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        logger.LogInformation("Sentja Cloud Service v1.0 starting...");

        // Load saved authentication token
        var token = TokenStorage.LoadToken();
        if (token != null)
        {
            apiClient.SetToken(token);
            logger.LogInformation("Authentication token loaded");
        }
        else
        {
            logger.LogWarning("No saved token — service will run in limited mode until user logs in via tray app.");
        }

        // Initial sync: populate sync root with placeholder files
        if (token != null)
        {
            try
            {
                await syncManager.InitialSyncAsync(stoppingToken);
            }
            catch (Exception ex)
            {
                logger.LogError("Initial sync failed: {Error}", ex.Message);
            }
        }

        // Start background services in parallel
        await Task.WhenAll(
            RunWithRecovery("Heartbeat", () => heartbeatService.StartAsync(stoppingToken), stoppingToken),
            RunWithRecovery("Policy", () => policyService.StartAsync(stoppingToken), stoppingToken),
            RunMainLoop(stoppingToken)
        );

        logger.LogInformation("Sentja Cloud Service stopped");
    }

    private async Task RunMainLoop(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            try { await Task.Delay(TimeSpan.FromMinutes(5), ct); }
            catch (OperationCanceledException) { break; }
        }
    }

    private async Task RunWithRecovery(string name, Func<Task> action, CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            try
            {
                await action();
                break;
            }
            catch (OperationCanceledException) { break; }
            catch (Exception ex)
            {
                logger.LogError("{Service} crashed: {Error}. Restarting in 30s...", name, ex.Message);
                await Task.Delay(TimeSpan.FromSeconds(30), ct);
            }
        }
    }
}
