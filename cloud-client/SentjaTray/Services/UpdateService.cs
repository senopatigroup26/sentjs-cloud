using System;
using System.Threading.Tasks;
using Squirrel;
using Squirrel.Sources;
using WpfMessageBox = System.Windows.MessageBox;
using MessageBoxButton = System.Windows.MessageBoxButton;
using MessageBoxImage = System.Windows.MessageBoxImage;
using MessageBoxResult = System.Windows.MessageBoxResult;

namespace SentjaTray.Services;

public class UpdateService
{
    private readonly string _updateUrl;

    public UpdateService(string updateUrl)
    {
        _updateUrl = updateUrl;
    }

    public async Task<bool> CheckForUpdatesAsync(bool silent = true)
    {
        try
        {
            using (var mgr = new UpdateManager(new GithubSource(_updateUrl, null, false)))
            {
                var updateInfo = await mgr.CheckForUpdate();

                if (updateInfo != null && updateInfo.ReleasesToApply.Count > 0)
                {
                    if (!silent)
                    {
                        var result = WpfMessageBox.Show(
                            $"New version {updateInfo.FutureReleaseEntry.Version} is available!\n\n" +
                            $"Current version: {updateInfo.CurrentlyInstalledVersion?.Version}\n\n" +
                            "Do you want to download and install the update?",
                            "Sentja Cloud - Update Available",
                            MessageBoxButton.YesNo,
                            MessageBoxImage.Information);

                        if (result == MessageBoxResult.No)
                            return false;
                    }

                    // Download and apply updates
                    await mgr.DownloadReleases(updateInfo.ReleasesToApply);
                    await mgr.ApplyReleases(updateInfo);

                    if (!silent)
                    {
                        var restart = WpfMessageBox.Show(
                            "Update downloaded successfully!\n\n" +
                            "The application needs to restart to apply the update.\n\n" +
                            "Restart now?",
                            "Sentja Cloud - Update Ready",
                            MessageBoxButton.YesNo,
                            MessageBoxImage.Question);

                        if (restart == MessageBoxResult.Yes)
                        {
                            UpdateManager.RestartApp();
                        }
                    }
                    else
                    {
                        // Auto-restart in silent mode
                        UpdateManager.RestartApp();
                    }

                    return true;
                }

                if (!silent)
                {
                    WpfMessageBox.Show(
                        $"You are running the latest version ({updateInfo?.CurrentlyInstalledVersion?.Version}).",
                        "Sentja Cloud - No Updates",
                        MessageBoxButton.OK,
                        MessageBoxImage.Information);
                }

                return false;
            }
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
            System.Diagnostics.Debug.WriteLine($"Update check failed: {ex.Message}");
            return false;
        }
    }

    public async Task<string?> GetCurrentVersionAsync()
    {
        try
        {
            using (var mgr = new UpdateManager(new GithubSource(_updateUrl, null, false)))
            {
                var updateInfo = await mgr.CheckForUpdate();
                return updateInfo?.CurrentlyInstalledVersion?.Version?.ToString();
            }
        }
        catch
        {
            return null;
        }
    }
}
