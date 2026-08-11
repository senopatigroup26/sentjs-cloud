using System.IO;
using System.Windows;
using SentjaShared.ApiClient;
using SentjaShared.Models;
using SentjaShared.Storage;
using SentjaShared.Utils;

namespace SentjaTray;

public partial class LoginWindow : Window
{
    private readonly SentjaApiClient _apiClient;
    public event Action? LoginSuccessful;

    public LoginWindow(SentjaApiClient apiClient)
    {
        InitializeComponent();
        _apiClient = apiClient;
        EmailBox.Focus();
    }

    private async void OnLoginClick(object sender, RoutedEventArgs e)
    {
        var email = EmailBox.Text.Trim();
        var password = PasswordBox.Password;

        if (string.IsNullOrEmpty(email) || string.IsNullOrEmpty(password))
        {
            ShowError("Please enter email and password.");
            return;
        }

        SetLoading(true);
        ClearError();

        try
        {
            // Login
            var loginResult = await _apiClient.LoginAsync(email, password);
            if (!loginResult.Success || loginResult.Data == null)
            {
                ShowError(loginResult.Error ?? "Login failed. Check your credentials.");
                return;
            }

            // Check if device is already registered (from saved token or local storage)
            var savedDeviceId = LoadDeviceId();
            
            if (string.IsNullOrEmpty(savedDeviceId))
            {
                // First time login on this device - collect hardware and register
                SetLoading(true);
                StatusText.Text = "Collecting hardware info...";
                
                var hardwareSnapshot = HardwareCollector.CollectSnapshot();
                
                StatusText.Text = "Registering device...";
                
                var deviceRequest = new DeviceRegisterRequest
                {
                    MachineName = Environment.MachineName,
                    MachineId = GetMachineId(),
                    OsVersion = Environment.OSVersion.ToString(),
                    IpAddress = GetLocalIpAddress(),
                    HardwareSnapshot = hardwareSnapshot
                };

                var deviceResult = await _apiClient.RegisterDeviceAsync(deviceRequest);
                if (!deviceResult.Success || deviceResult.Data == null)
                {
                    ShowError(deviceResult.Error ?? "Failed to register device.");
                    return;
                }
                
                // Save device ID for future logins
                SaveDeviceId(deviceResult.Data.DeviceId);
                
                // Also save hardware fingerprint locally for quick check
                if (!string.IsNullOrEmpty(deviceResult.Data.HardwareFingerprint))
                {
                    SaveHardwareFingerprint(deviceResult.Data.HardwareFingerprint);
                }
            }

            // Save token
            var tokenInfo = _apiClient.GetToken();
            if (tokenInfo != null)
            {
                TokenStorage.SaveToken(tokenInfo);
            }

            LoginSuccessful?.Invoke();
        }
        catch (Exception ex)
        {
            ShowError($"Connection error: {ex.Message}");
        }
        finally
        {
            SetLoading(false);
        }
    }

    private static string? LoadDeviceId()
    {
        try
        {
            var path = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), 
                "Sentja", "device_id.txt");
            if (File.Exists(path))
                return File.ReadAllText(path).Trim();
        }
        catch { }
        return null;
    }

    private static void SaveDeviceId(string deviceId)
    {
        try
        {
            var dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "Sentja");
            Directory.CreateDirectory(dir);
            var path = Path.Combine(dir, "device_id.txt");
            File.WriteAllText(path, deviceId);
        }
        catch { }
    }
    
    private static void SaveHardwareFingerprint(string fingerprint)
    {
        try
        {
            var dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "Sentja");
            Directory.CreateDirectory(dir);
            var path = Path.Combine(dir, "hardware_fingerprint.txt");
            File.WriteAllText(path, fingerprint);
        }
        catch { }
    }

    private void SetLoading(bool loading)
    {
        LoginButton.IsEnabled = !loading;
        StatusText.Text = loading ? "Signing in..." : "";
        EmailBox.IsEnabled = !loading;
        PasswordBox.IsEnabled = !loading;
    }

    private void ShowError(string message)
    {
        ErrorText.Text = message;
        ErrorBorder.Visibility = Visibility.Visible;
    }

    private void ClearError()
    {
        ErrorBorder.Visibility = Visibility.Collapsed;
    }

    private static string GetMachineId()
    {
        try
        {
            var key = Microsoft.Win32.Registry.LocalMachine
                .OpenSubKey(@"SOFTWARE\Microsoft\Cryptography");
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
}
