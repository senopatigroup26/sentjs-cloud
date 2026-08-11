using System.IO;
using System.Windows;
using System.Drawing;
using System.Windows.Forms;
using SentjaShared.ApiClient;
using SentjaShared.Config;
using SentjaShared.Storage;
using SentjaTray.Services;

// Disambiguate
using WpfMessageBox = System.Windows.MessageBox;

namespace SentjaTray;

public partial class App : System.Windows.Application
{
    private NotifyIcon? _notifyIcon;
    private SentjaApiClient? _apiClient;
    private System.Windows.Threading.DispatcherTimer? _statusTimer;
    private SentjaMigration.SyncManager? _syncManager;
    private UpdateService? _updateService;

    public App()
    {
        // Global exception handlers
        AppDomain.CurrentDomain.UnhandledException += (s, e) =>
        {
            var ex = e.ExceptionObject as Exception;
            System.Windows.MessageBox.Show(
                $"Unhandled exception:\n{ex?.Message}\n\nStack:\n{ex?.StackTrace}",
                "Sentja Cloud - Error",
                System.Windows.MessageBoxButton.OK,
                System.Windows.MessageBoxImage.Error);
        };

        DispatcherUnhandledException += (s, e) =>
        {
            System.Windows.MessageBox.Show(
                $"Dispatcher exception:\n{e.Exception.Message}\n\nStack:\n{e.Exception.StackTrace}",
                "Sentja Cloud - Error",
                System.Windows.MessageBoxButton.OK,
                System.Windows.MessageBoxImage.Error);
            e.Handled = true;
        };
    }

    protected override void OnStartup(StartupEventArgs e)
    {
        try
        {
            base.OnStartup(e);
            ShutdownMode = ShutdownMode.OnExplicitShutdown;

            _apiClient = new SentjaApiClient();
            
            // Initialize update service (GitHub Releases)
            _updateService = new UpdateService("https://github.com/senopatigroup26/sentjs-cloud");

            InitializeTrayIcon();

            // Check for updates on startup (silent)
            _ = CheckForUpdatesAsync(silent: true);

            // Auto-register device based on hardware
            _ = AutoRegisterDeviceAsync();
        }
        catch (Exception ex)
        {
            System.Windows.MessageBox.Show(
                $"Failed to start application:\n{ex.Message}\n\nStack trace:\n{ex.StackTrace}",
                "Sentja Cloud - Startup Error",
                System.Windows.MessageBoxButton.OK,
                System.Windows.MessageBoxImage.Error);
            Shutdown();
        }
    }

    private void InitializeTrayIcon()
    {
        // Try to load custom icon, fallback to system icon
        Icon icon;
        try
        {
            var iconPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Resources", "logo.ico");
            if (File.Exists(iconPath))
            {
                icon = new Icon(iconPath);
            }
            else
            {
                // Fallback: use system application icon
                icon = SystemIcons.Application;
            }
        }
        catch
        {
            icon = SystemIcons.Application;
        }

        _notifyIcon = new NotifyIcon
        {
            Icon = icon,
            Text = "Sentja Cloud",
            Visible = true,
        };

        var menu = new ContextMenuStrip();

        var statusItem = new ToolStripMenuItem("● Connected") { Enabled = false, Name = "status" };
        menu.Items.Add(statusItem);
        menu.Items.Add(new ToolStripSeparator());

        var openFolderItem = new ToolStripMenuItem("Open Cloud Folder", null, OnOpenFolder);
        menu.Items.Add(openFolderItem);

        var migrationItem = new ToolStripMenuItem("Sync Status", null, OnMigrationStatus);
        menu.Items.Add(migrationItem);
        
        var syncNowItem = new ToolStripMenuItem("Sync Now", null, OnSyncNow);
        menu.Items.Add(syncNowItem);

        menu.Items.Add(new ToolStripSeparator());
        
        var checkUpdateItem = new ToolStripMenuItem("Check for Updates", null, OnCheckForUpdates);
        menu.Items.Add(checkUpdateItem);

        menu.Items.Add(new ToolStripSeparator());

        var exitItem = new ToolStripMenuItem("Exit", null, OnExit);
        menu.Items.Add(exitItem);

        _notifyIcon.ContextMenuStrip = menu;
        _notifyIcon.DoubleClick += (_, _) => OnOpenFolder(null, EventArgs.Empty);
    }

    public void UpdateStatus(string status, bool isConnected)
    {
        Dispatcher.Invoke(() =>
        {
            if (_notifyIcon?.ContextMenuStrip?.Items["status"] is ToolStripMenuItem statusItem)
            {
                statusItem.Text = isConnected ? $"● {status}" : $"○ {status}";
                statusItem.ForeColor = isConnected ? System.Drawing.Color.Green : System.Drawing.Color.Gray;
            }
            _notifyIcon!.Text = $"Sentja Cloud — {status}";
        });
    }

    private void StartStatusRefresh()
    {
        _statusTimer = new System.Windows.Threading.DispatcherTimer
        {
            Interval = TimeSpan.FromMinutes(1)
        };
        _statusTimer.Tick += async (_, _) => await RefreshStatusAsync();
        _statusTimer.Start();
        _ = RefreshStatusAsync();
    }

    private async Task RefreshStatusAsync()
    {
        try
        {
            var token = _apiClient?.GetToken();
            if (token == null)
            {
                UpdateStatus("Initializing...", false);
                return;
            }
            
            var result = await _apiClient!.SendHeartbeatAsync(new SentjaShared.Models.DeviceHeartbeatRequest { Status = "online" });
            if (result.Success)
            {
                UpdateStatus("Connected", true);
            }
            else
            {
                UpdateStatus("Connection error", false);
            }
        }
        catch (Exception ex)
        {
            UpdateStatus($"Error: {ex.Message}", false);
        }
    }

    private void StartAutoSync()
    {
        try
        {
            _syncManager?.Dispose();
            _syncManager = new SentjaMigration.SyncManager(
                Microsoft.Extensions.Logging.Abstractions.NullLogger<SentjaMigration.SyncManager>.Instance,
                _apiClient!);
            _syncManager.StartWatching();
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Auto-sync start failed: {ex.Message}");
        }
    }

    private async Task AutoRegisterDeviceAsync()
    {
        try
        {
            UpdateStatus("Initializing...", false);
            
            // Try to load existing device token
            var token = TokenStorage.LoadToken();
            if (token != null)
            {
                _apiClient.SetToken(token);
                UpdateStatus("Connected", true);
                StartStatusRefresh();
                return;
            }
            
            // Collect hardware info
            UpdateStatus("Collecting hardware info...", false);
            var hardwareSnapshot = SentjaShared.Utils.HardwareCollector.CollectSnapshot();
            var hardwareFingerprint = SentjaShared.Utils.HardwareCollector.GenerateFingerprint(hardwareSnapshot);
            
            // Check if device already registered locally
            var deviceIdFile = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
                "Sentja", "device_id.txt");
            
            var hardwareFingerprintFile = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
                "Sentja", "hardware_fingerprint.txt");
            
            string? savedFingerprint = null;
            if (File.Exists(hardwareFingerprintFile))
            {
                savedFingerprint = await File.ReadAllTextAsync(hardwareFingerprintFile);
                savedFingerprint = savedFingerprint?.Trim();
            }
            
            // If hardware fingerprint matches, don't re-register
            if (!string.IsNullOrEmpty(savedFingerprint) && savedFingerprint == hardwareFingerprint)
            {
                UpdateStatus("Device already registered", false);
                // Try to load token again (might have been saved after check)
                token = TokenStorage.LoadToken();
                if (token != null)
                {
                    _apiClient.SetToken(token);
                    UpdateStatus("Connected", true);
                    StartStatusRefresh();
                    return;
                }
                else
                {
                    UpdateStatus("Token missing - please restart", false);
                    return;
                }
            }
            
            // If hardware changed, re-register
            if (savedFingerprint != null && savedFingerprint != hardwareFingerprint)
            {
                WpfMessageBox.Show(
                    "Hardware changed detected. Device will be re-registered.",
                    "Sentja Cloud",
                    System.Windows.MessageBoxButton.OK,
                    System.Windows.MessageBoxImage.Information);
                
                // Clear old registration
                if (File.Exists(deviceIdFile)) File.Delete(deviceIdFile);
                if (File.Exists(hardwareFingerprintFile)) File.Delete(hardwareFingerprintFile);
                TokenStorage.ClearToken();
            }
            
            // Auto-register device
            UpdateStatus("Registering device...", false);
            
            var machineId = GetMachineId();
            var request = new SentjaShared.Models.DeviceRegisterRequest
            {
                MachineName = Environment.MachineName,
                MachineId = machineId,
                OsVersion = Environment.OSVersion.ToString(),
                IpAddress = GetLocalIpAddress(),
                HardwareSnapshot = hardwareSnapshot
            };
            
            var result = await _apiClient.AutoRegisterDeviceAsync(request);
            
            if (!result.Success || result.Data == null)
            {
                UpdateStatus($"Registration failed: {result.Error}", false);
                WpfMessageBox.Show(
                    $"Failed to register device:\n{result.Error}",
                    "Sentja Cloud - Registration Error",
                    System.Windows.MessageBoxButton.OK,
                    System.Windows.MessageBoxImage.Error);
                return;
            }
            
            // Save device info
            Directory.CreateDirectory(Path.GetDirectoryName(deviceIdFile)!);
            await File.WriteAllTextAsync(deviceIdFile, result.Data.DeviceId);
            await File.WriteAllTextAsync(hardwareFingerprintFile, hardwareFingerprint);
            
            // Save token
            var tokenInfo = _apiClient.GetToken();
            if (tokenInfo != null)
            {
                TokenStorage.SaveToken(tokenInfo);
            }
            
            UpdateStatus("Connected", true);
            StartStatusRefresh();
            StartAutoSync();
            
            WpfMessageBox.Show(
                $"Device registered successfully!\n\nMachine: {Environment.MachineName}\nHardware ID: {hardwareFingerprint[..12]}...",
                "Sentja Cloud",
                System.Windows.MessageBoxButton.OK,
                System.Windows.MessageBoxImage.Information);
        }
        catch (Exception ex)
        {
            UpdateStatus($"Error: {ex.Message}", false);
            WpfMessageBox.Show(
                $"Failed to initialize device:\n{ex.Message}",
                "Sentja Cloud - Error",
                System.Windows.MessageBoxButton.OK,
                System.Windows.MessageBoxImage.Error);
        }
    }
    
    private static string GetMachineId()
    {
        try
        {
            var key = Microsoft.Win32.Registry.LocalMachine.OpenSubKey(@"SOFTWARE\Microsoft\Cryptography");
            return key?.GetValue("MachineGuid")?.ToString() ?? Environment.MachineName;
        }
        catch
        {
            return Environment.MachineName;
        }
    }
    
    private static string? GetLocalIpAddress()
    {
        try
        {
            var host = System.Net.Dns.GetHostEntry(System.Net.Dns.GetHostName());
            foreach (var ip in host.AddressList)
            {
                if (ip.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork)
                    return ip.ToString();
            }
        }
        catch { }
        return null;
    }

    private void ShowLoginWindow()
    {
        var loginWin = new LoginWindow(_apiClient!);
        loginWin.LoginSuccessful += () =>
        {
            loginWin.Close();
            StartStatusRefresh();
        };
        loginWin.Show();
    }

    private void OnOpenFolder(object? sender, EventArgs e)
    {
        var path = AppConfig.Instance.SyncRootPath;
        if (!Directory.Exists(path)) Directory.CreateDirectory(path);
        System.Diagnostics.Process.Start("explorer.exe", path);
    }

    private void OnMigrationStatus(object? sender, EventArgs e)
    {
        var win = new MigrationStatusWindow(_apiClient!);
        win.Show();
    }

    private void OnSyncNow(object? sender, EventArgs e)
    {
        UpdateStatus("Syncing...", true);
        _ = Task.Run(async () =>
        {
            try
            {
                // Trigger sync via SentjaMigration
                var syncRoot = AppConfig.Instance.SyncRootPath;
                if (!Directory.Exists(syncRoot))
                {
                    Directory.CreateDirectory(syncRoot);
                }
                
                // TODO: Implement actual sync logic
                await Task.Delay(1000);
                
                Dispatcher.Invoke(() => UpdateStatus("Sync complete", true));
            }
            catch (Exception ex)
            {
                Dispatcher.Invoke(() => UpdateStatus($"Sync error: {ex.Message}", false));
            }
        });
    }

    private void OnSettings(object? sender, EventArgs e)
    {
        var win = new SettingsWindow();
        win.Show();
    }

    private async Task CheckForUpdatesAsync(bool silent = true)
    {
        if (_updateService == null) return;
        
        try
        {
            await _updateService.CheckForUpdatesAsync(silent);
        }
        catch (Exception ex)
        {
            if (!silent)
            {
                WpfMessageBox.Show(
                    $"Failed to check for updates:\n{ex.Message}",
                    "Sentja Cloud - Update Error",
                    MessageBoxButton.OK,
                    MessageBoxImage.Error);
            }
        }
    }

    private void OnCheckForUpdates(object? sender, EventArgs e)
    {
        _ = CheckForUpdatesAsync(silent: false);
    }

    private void OnExit(object? sender, EventArgs e)
    {
        _notifyIcon?.Dispose();
        Shutdown();
    }

    protected override void OnExit(ExitEventArgs e)
    {
        _notifyIcon?.Dispose();
        _statusTimer?.Stop();
        base.OnExit(e);
    }
}

