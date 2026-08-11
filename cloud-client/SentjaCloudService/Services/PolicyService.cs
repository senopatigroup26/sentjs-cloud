using SentjaShared.ApiClient;
using SentjaShared.Models;

namespace SentjaCloudService.Services;

public class PolicyService
{
    private readonly ILogger<PolicyService> _logger;
    private readonly SentjaApiClient _apiClient;
    private DevicePolicy? _currentPolicy;
    private readonly SemaphoreSlim _policyLock = new(1, 1);

    public PolicyService(ILogger<PolicyService> logger, SentjaApiClient apiClient)
    {
        _logger = logger;
        _apiClient = apiClient;
    }

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        _logger.LogInformation("Policy service starting...");

        // Refresh policy every 5 minutes
        var interval = TimeSpan.FromMinutes(5);

        while (!cancellationToken.IsCancellationRequested)
        {
            try
            {
                var token = _apiClient.GetToken();
                if (token?.DeviceToken != null)
                {
                    await RefreshPolicyAsync();
                }

                await Task.Delay(interval, cancellationToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error refreshing policy");
                await Task.Delay(TimeSpan.FromSeconds(60), cancellationToken);
            }
        }

        _logger.LogInformation("Policy service stopped");
    }

    public async Task<DevicePolicy?> GetPolicyAsync()
    {
        if (_currentPolicy == null)
        {
            await RefreshPolicyAsync();
        }
        return _currentPolicy;
    }

    private async Task RefreshPolicyAsync()
    {
        await _policyLock.WaitAsync();
        try
        {
            var response = await _apiClient.GetDevicePolicyAsync();
            if (response.Success && response.Data != null)
            {
                _currentPolicy = response.Data;
                _logger.LogInformation("Policy updated: AllowUsb={AllowUsb}, AllowCopy={AllowCopy}, AllowExport={AllowExport}",
                    _currentPolicy.AllowUsb,
                    _currentPolicy.AllowCopy,
                    _currentPolicy.AllowExport);
            }
            else
            {
                _logger.LogWarning("Failed to refresh policy: {Error}", response.Error);
            }
        }
        finally
        {
            _policyLock.Release();
        }
    }

    public async Task<bool> CheckActionAllowedAsync(string action)
    {
        var policy = await GetPolicyAsync();
        if (policy == null)
        {
            // Default to restrictive if policy not available
            return false;
        }

        return action.ToLower() switch
        {
            "usb" => policy.AllowUsb,
            "copy" => policy.AllowCopy,
            "export" => policy.AllowExport,
            _ => policy.RequirePermission == false
        };
    }
}
