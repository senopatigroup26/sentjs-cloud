using System.IO;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using Microsoft.Extensions.Logging.Abstractions;
using SentjaShared.ApiClient;
using SentjaShared.Config;
using SentjaShared.Models;
using SentjaMigration;
using WpfColor = System.Windows.Media.Color;
using IoPath = System.IO.Path;

namespace SentjaTray;

public partial class MigrationStatusWindow : Window
{
    private readonly SentjaApiClient _apiClient;
    private readonly string _syncRoot;

    public MigrationStatusWindow(SentjaApiClient apiClient)
    {
        InitializeComponent();
        _apiClient = apiClient;
        _syncRoot  = AppConfig.Instance.SyncRootPath;
        _ = LoadAsync();
    }

    private async Task LoadAsync()
    {
        await Dispatcher.InvokeAsync(() => SubtitleText.Text = "Loading...");

        try
        {
            // ── Read device_id from disk ──────────────────────────────────────
            string? deviceId = null;
            var deviceIdFile = IoPath.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
                "Sentja", "device_id.txt");
            if (File.Exists(deviceIdFile))
            {
                deviceId = (await File.ReadAllTextAsync(deviceIdFile)).Trim();
            }

            if (string.IsNullOrEmpty(deviceId))
            {
                await Dispatcher.InvokeAsync(() => SubtitleText.Text = "Device not registered!");
                return;
            }

            // ── 1. Fetch synced files from backend API ────────────────────────
            int    apiTotal     = 0;
            int    apiSynced    = 0;
            long   apiBytes     = 0;
            var    recentFiles  = new List<(string name, long size, string status)>();

            var filesResult = await _apiClient.GetFilesAsync(
                new FileListRequest { Page = 1, PageSize = 200, DeviceId = deviceId });

            if (filesResult.Success && filesResult.Data != null)
            {
                var all    = filesResult.Data.Data;
                apiTotal   = filesResult.Data.Total > 0 ? filesResult.Data.Total : all.Count;
                apiSynced  = all.Count(f => f.Status == "synced");
                apiBytes   = all.Where(f => f.Status == "synced").Sum(f => f.FileSize);
                recentFiles = all
                    .OrderByDescending(f => f.LastModified)
                    .Take(8)
                    .Select(f => (f.FileName, f.FileSize, f.Status))
                    .ToList();
            }

            // ── 2. Count files on disk that are NOT yet synced (size > 0) ────
            int  pendingCount = 0;
            long diskSize     = 0;
            if (Directory.Exists(_syncRoot))
            {
                var diskFiles = Directory.GetFiles(_syncRoot, "*", SearchOption.AllDirectories);
                diskSize = diskFiles.Sum(f => { try { return new FileInfo(f).Length; } catch { return 0L; } });
                // Only count as pending if file has content (not dehydrated placeholder)
                var syncedNames = filesResult.Success && filesResult.Data != null
                    ? filesResult.Data.Data.Select(f => f.FileName).ToHashSet(StringComparer.OrdinalIgnoreCase)
                    : new HashSet<string>();
                pendingCount = diskFiles
                    .Where(f => new FileInfo(f).Length > 0)
                    .Count(f => !syncedNames.Contains(IoPath.GetFileName(f)));
            }

            // ── 3. Display: total = synced + pending new files ────────────────
            var displayTotal  = apiSynced + pendingCount;
            var displaySynced = apiSynced;
            var pending       = pendingCount;
            var pct           = displayTotal > 0
                ? (int)((double)displaySynced / displayTotal * 100)
                : 100;

            // ── 4. Update UI ─────────────────────────────────────────────────
            await Dispatcher.InvokeAsync(() =>
            {
                // Stat cards
                TotalFilesText.Text    = displayTotal.ToString("N0");
                SyncedFilesText.Text   = displaySynced.ToString("N0");
                UploadedBytesText.Text = FormatBytes(apiBytes > 0 ? apiBytes : diskSize);

                // Progress
                ProgressPctText.Text    = $"{pct}%";
                ProgressFill.Width      = Math.Max(0, 460 * pct / 100.0);
                ProgressDetailText.Text = displayTotal == 0
                    ? "No files yet. Add files to C:\\SentjaCloud\\ and click Sync Now."
                    : $"{displaySynced} synced, {pending} pending upload";

                // Subtitle
                SubtitleText.Text = $"{Environment.MachineName}  |  {_syncRoot}";

                // Device info
                DeviceInfoGrid.Children.Clear();
                DeviceInfoGrid.RowDefinitions.Clear();
                DeviceInfoGrid.ColumnDefinitions.Clear();
                AddDeviceRows(displayTotal, diskSize);

                // Recent files list
                RecentFilesPanel.Children.Clear();
                if (recentFiles.Count > 0)
                {
                    foreach (var (name, size, status) in recentFiles)
                        AddFileRow(name, size, status);
                }
                else if (pendingCount > 0)
                {
                    RecentFilesPanel.Children.Add(new TextBlock
                    {
                        Text       = $"{pendingCount} files pending upload. Click 'Sync Now'.",
                        FontSize   = 12,
                        Foreground = new SolidColorBrush(WpfColor.FromRgb(0xed, 0x89, 0x36)),
                    });
                }
                else
                {
                    RecentFilesPanel.Children.Add(new TextBlock
                    {
                        Text       = "No files yet. Add files to C:\\SentjaCloud\\",
                        FontSize   = 12,
                        Foreground = new SolidColorBrush(WpfColor.FromRgb(0xaa, 0xaa, 0xaa)),
                    });
                }

                LastRefreshText.Text = $"Refreshed: {DateTime.Now:HH:mm:ss}";
            });
        }
        catch (Exception ex)
        {
            await Dispatcher.InvokeAsync(() =>
            {
                SubtitleText.Text      = "Error loading status";
                ProgressDetailText.Text = ex.Message;
            });
        }
    }

    private void AddDeviceRows(int diskFiles, long diskSize)
    {
        DeviceInfoGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(140) });
        DeviceInfoGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });

        var deviceId = LoadDeviceId();
        var rows = new[]
        {
            ("Machine",     Environment.MachineName),
            ("OS",          Environment.OSVersion.VersionString),
            ("Sync Folder", _syncRoot),
            ("Disk Files",  $"{diskFiles} files ({FormatBytes(diskSize)})"),
            ("Device ID",   deviceId ?? "Not registered"),
            ("API",         AppConfig.Instance.ApiBaseUrl),
        };

        int i = 0;
        foreach (var (label, value) in rows)
        {
            DeviceInfoGrid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
            var lbl = new TextBlock
            {
                Text       = label,
                FontSize   = 12,
                Foreground = new SolidColorBrush(WpfColor.FromRgb(0x88, 0x88, 0x88)),
                Margin     = new Thickness(0, 3, 0, 3),
            };
            var val = new TextBlock
            {
                Text         = value,
                FontSize     = 12,
                Foreground   = new SolidColorBrush(WpfColor.FromRgb(0x1a, 0x1a, 0x2e)),
                TextWrapping = TextWrapping.Wrap,
                Margin       = new Thickness(0, 3, 0, 3),
            };
            Grid.SetRow(lbl, i); Grid.SetColumn(lbl, 0);
            Grid.SetRow(val, i); Grid.SetColumn(val, 1);
            DeviceInfoGrid.Children.Add(lbl);
            DeviceInfoGrid.Children.Add(val);
            i++;
        }
    }

    private void AddFileRow(string name, long size, string status)
    {
        var color = status == "synced"
            ? WpfColor.FromRgb(0x48, 0xbb, 0x78)
            : WpfColor.FromRgb(0xed, 0x89, 0x36);

        var row = new DockPanel { Margin = new Thickness(0, 4, 0, 4) };

        row.Children.Add(new System.Windows.Shapes.Ellipse
        {
            Width  = 8, Height = 8,
            Fill   = new SolidColorBrush(color),
            Margin = new Thickness(0, 0, 8, 0),
            VerticalAlignment = VerticalAlignment.Center,
        });

        var sizeBlock = new TextBlock
        {
            Text       = FormatBytes(size),
            FontSize   = 11,
            Foreground = new SolidColorBrush(WpfColor.FromRgb(0xaa, 0xaa, 0xaa)),
        };
        DockPanel.SetDock(sizeBlock, Dock.Right);
        row.Children.Add(sizeBlock);

        var statusBlock = new TextBlock
        {
            Text       = status,
            FontSize   = 11,
            Foreground = new SolidColorBrush(color),
            Margin     = new Thickness(0, 0, 12, 0),
        };
        DockPanel.SetDock(statusBlock, Dock.Right);
        row.Children.Add(statusBlock);

        row.Children.Add(new TextBlock
        {
            Text         = name,
            FontSize     = 12,
            Foreground   = new SolidColorBrush(WpfColor.FromRgb(0x1a, 0x1a, 0x2e)),
            TextWrapping = TextWrapping.NoWrap,
        });

        RecentFilesPanel.Children.Add(row);
    }

    private async void OnRefresh(object sender, RoutedEventArgs e)
        => await LoadAsync();

    private async void OnSyncNow(object sender, RoutedEventArgs e)
    {
        StartSyncBtn.IsEnabled = false;

        try
        {
            Directory.CreateDirectory(_syncRoot);

            var files = Directory.GetFiles(_syncRoot, "*", SearchOption.AllDirectories)
                                 .Where(f => new FileInfo(f).Length > 0)
                                 .ToList();

            if (files.Count == 0)
            {
                await Dispatcher.InvokeAsync(() => {
                    SubtitleText.Text = "No files to sync";
                    ProgressDetailText.Text = "Add files to C:\\SentjaCloud\\ and try again.";
                });
                return;
            }

            var syncMgr = new SyncManager(NullLogger<SyncManager>.Instance, _apiClient);
            int total = files.Count;

            for (int i = 0; i < total; i++)
            {
                var file = files[i];
                var fileName = IoPath.GetFileName(file);
                
                // Update progress BEFORE upload
                await Dispatcher.InvokeAsync(() =>
                {
                    int pct = (int)((double)i / total * 100);
                    SubtitleText.Text = $"Uploading {i + 1}/{total}: {fileName}";
                    ProgressPctText.Text = $"{pct}%";
                    ProgressFill.Width = Math.Max(0, 460.0 * pct / 100);
                    ProgressDetailText.Text = $"Processing: {fileName}";
                    SyncedFilesText.Text = i.ToString("N0");
                });

                // Upload file - will throw exception on error
                await syncMgr.UploadFileAsync(file);
            }

            // Final success state
            await Dispatcher.InvokeAsync(() =>
            {
                SubtitleText.Text = $"✓ Sync complete! {total} files uploaded";
                ProgressPctText.Text = "100%";
                ProgressFill.Width = 460;
                ProgressDetailText.Text = $"All {total} files synced successfully";
                SyncedFilesText.Text = total.ToString("N0");
            });
        }
        catch (Exception ex)
        {
            await Dispatcher.InvokeAsync(() =>
            {
                SubtitleText.Text = "✗ Sync failed";
                ProgressDetailText.Text = $"Error: {ex.Message}";
                System.Windows.MessageBox.Show(
                    $"Sync failed:\n\n{ex.Message}\n\nCheck:\n- Internet connection\n- Device registered\n- API server running",
                    "Sync Error",
                    MessageBoxButton.OK,
                    MessageBoxImage.Error
                );
            });
        }
        finally
        {
            StartSyncBtn.IsEnabled = true;
            await LoadAsync();
        }
    }

    private void OnClose(object sender, RoutedEventArgs e) => Close();

    private static string? LoadDeviceId()
    {
        try
        {
            var path = IoPath.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
                "Sentja", "device_id.txt");
            return File.Exists(path) ? File.ReadAllText(path).Trim() : null;
        }
        catch { return null; }
    }

    private static string FormatBytes(long bytes)
    {
        if (bytes <= 0) return "0 B";
        string[] units = ["B", "KB", "MB", "GB", "TB"];
        double size = bytes;
        int i = 0;
        while (size >= 1024 && i < units.Length - 1) { size /= 1024; i++; }
        return $"{size:F1} {units[i]}";
    }
}



