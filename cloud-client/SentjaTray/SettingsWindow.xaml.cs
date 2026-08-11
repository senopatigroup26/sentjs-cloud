using System.Windows;
using SentjaShared.Config;

// Disambiguate MessageBox
using WpfMsgBox = System.Windows.MessageBox;

namespace SentjaTray;

public partial class SettingsWindow : Window
{
    public SettingsWindow()
    {
        InitializeComponent();
        LoadSettings();
    }

    private void LoadSettings()
    {
        var cfg = AppConfig.Instance;
        ApiUrlBox.Text    = cfg.ApiBaseUrl;
        SyncRootBox.Text  = cfg.SyncRootPath;
        CacheSizeBox.Text = (cfg.MaxCacheSize / (1024L * 1024 * 1024)).ToString();
        HeartbeatBox.Text = cfg.HeartbeatInterval.ToString();
    }

    private void OnBrowseSyncRoot(object sender, RoutedEventArgs e)
    {
        using var dialog = new System.Windows.Forms.FolderBrowserDialog
        {
            Description  = "Select Sync Root Folder",
            SelectedPath = SyncRootBox.Text,
        };
        if (dialog.ShowDialog() == System.Windows.Forms.DialogResult.OK)
            SyncRootBox.Text = dialog.SelectedPath;
    }

    private void OnSave(object sender, RoutedEventArgs e)
    {
        try
        {
            var cfg = AppConfig.Instance;
            cfg.ApiBaseUrl   = ApiUrlBox.Text.Trim().TrimEnd('/');
            cfg.SyncRootPath = SyncRootBox.Text.Trim();

            if (long.TryParse(CacheSizeBox.Text, out var gb))
                cfg.MaxCacheSize = gb * 1024L * 1024 * 1024;

            if (int.TryParse(HeartbeatBox.Text, out var hb))
                cfg.HeartbeatInterval = hb;

            cfg.Save();
            WpfMsgBox.Show("Settings saved.", "Sentja Cloud",
                MessageBoxButton.OK, MessageBoxImage.Information);
            Close();
        }
        catch (Exception ex)
        {
            WpfMsgBox.Show($"Failed to save settings:\n{ex.Message}",
                "Error", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    private void OnCancel(object sender, RoutedEventArgs e) => Close();
}
