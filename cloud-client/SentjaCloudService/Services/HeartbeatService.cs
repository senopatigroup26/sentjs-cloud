using SentjaShared.ApiClient;
using SentjaShared.Config;
using SentjaShared.Models;
using System.Runtime.InteropServices;

namespace SentjaCloudService.Services;

public class HeartbeatService
{
    private readonly ILogger<HeartbeatService> _logger;
    private readonly SentjaApiClient _apiClient;

    [StructLayout(LayoutKind.Sequential)]
    private struct MEMORYSTATUSEX
    {
        public uint dwLength;
        public uint dwMemoryLoad;
        public ulong ullTotalPhys;
        public ulong ullAvailPhys;
        public ulong ullTotalPageFile;
        public ulong ullAvailPageFile;
        public ulong ullTotalVirtual;
        public ulong ullAvailVirtual;
        public ulong ullAvailExtendedVirtual;
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GlobalMemoryStatusEx(ref MEMORYSTATUSEX lpBuffer);

    public HeartbeatService(ILogger<HeartbeatService> logger, SentjaApiClient apiClient)
    {
        _logger = logger;
        _apiClient = apiClient;
    }

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        _logger.LogInformation("Heartbeat service starting...");

        var interval = TimeSpan.FromSeconds(AppConfig.Instance.HeartbeatInterval);

        while (!cancellationToken.IsCancellationRequested)
        {
            try
            {
                var token = _apiClient.GetToken();
                if (token?.DeviceToken != null)
                {
                    var systemInfo = CollectSystemInfo();
                    var request = new DeviceHeartbeatRequest
                    {
                        Status = "online",
                        SystemInfo = systemInfo
                    };

                    var response = await _apiClient.SendHeartbeatAsync(request);
                    if (response.Success)
                    {
                        _logger.LogDebug("Heartbeat sent successfully");
                    }
                    else
                    {
                        _logger.LogWarning("Heartbeat failed: {Error}", response.Error);
                    }
                }
                else
                {
                    _logger.LogDebug("Device not registered, skipping heartbeat");
                }

                await Task.Delay(interval, cancellationToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error sending heartbeat");
                await Task.Delay(TimeSpan.FromSeconds(30), cancellationToken);
            }
        }

        _logger.LogInformation("Heartbeat service stopped");
    }

    private Dictionary<string, object> CollectSystemInfo()
    {
        var info = new Dictionary<string, object>
        {
            ["timestamp"] = DateTime.UtcNow,
            ["machineName"] = Environment.MachineName,
            ["osVersion"] = Environment.OSVersion.ToString(),
            ["processorCount"] = Environment.ProcessorCount,
            ["workingSetMB"] = Environment.WorkingSet / (1024 * 1024)
        };

        try
        {
            // Get memory info using Windows API
            var memStatus = new MEMORYSTATUSEX
            {
                dwLength = (uint)Marshal.SizeOf<MEMORYSTATUSEX>()
            };

            if (GlobalMemoryStatusEx(ref memStatus))
            {
                info["totalMemoryMB"] = (long)(memStatus.ullTotalPhys / (1024 * 1024));
                info["availableMemoryMB"] = (long)(memStatus.ullAvailPhys / (1024 * 1024));
                info["memoryLoad"] = memStatus.dwMemoryLoad;
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning("Failed to collect memory info: {Error}", ex.Message);
        }

        return info;
    }
}
