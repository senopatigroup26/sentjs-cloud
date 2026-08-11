using System.Text.Json;

namespace SentjaShared.Config;

public class AppConfig
{
    public string ApiBaseUrl { get; set; } = "https://api-cloud.sentjagroup.tech/api";
    public string SyncRootPath { get; set; } = @"C:\SentjaCloud";
    public string LocalCachePath { get; set; } = @"C:\ProgramData\Sentja\Cache";
    public string LocalDbPath { get; set; } = @"C:\ProgramData\Sentja\sentja.db";
    public long MaxCacheSize { get; set; } = 10L * 1024 * 1024 * 1024; // 10GB
    public int HeartbeatInterval { get; set; } = 60; // seconds
    public int TokenRefreshBuffer { get; set; } = 300; // seconds before expiry

    // Hetzner SFTP - UPDATE WITH YOUR REAL CREDENTIALS
    public string HetznerHost { get; set; } = "u644687.your-storagebox.de";
    public int HetznerPort { get; set; } = 23;
    public string HetznerUser { get; set; } = "u644687";
    public string HetznerPassword { get; set; } = "MASUKKAN_PASSWORD_HETZNER_DISINI";
    public string HetznerBasePath { get; set; } = "/sentja";

    private static AppConfig? _instance;
    private static readonly object _lock = new();
    private static readonly string ConfigPath = @"C:\ProgramData\Sentja\config.json";

    public static AppConfig Instance
    {
        get
        {
            if (_instance == null)
            {
                lock (_lock)
                {
                    _instance ??= Load();
                }
            }
            return _instance;
        }
    }

    private static AppConfig Load()
    {
        try
        {
            var directory = Path.GetDirectoryName(ConfigPath);
            if (!string.IsNullOrEmpty(directory) && !Directory.Exists(directory))
            {
                Directory.CreateDirectory(directory);
            }

            if (File.Exists(ConfigPath))
            {
                var json = File.ReadAllText(ConfigPath);
                return JsonSerializer.Deserialize<AppConfig>(json) ?? new AppConfig();
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Failed to load config: {ex.Message}");
        }

        var config = new AppConfig();
        config.Save();
        return config;
    }

    public void Save()
    {
        try
        {
            var directory = Path.GetDirectoryName(ConfigPath);
            if (!string.IsNullOrEmpty(directory) && !Directory.Exists(directory))
            {
                Directory.CreateDirectory(directory);
            }

            var json = JsonSerializer.Serialize(this, new JsonSerializerOptions
            {
                WriteIndented = true
            });
            File.WriteAllText(ConfigPath, json);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Failed to save config: {ex.Message}");
        }
    }
}
