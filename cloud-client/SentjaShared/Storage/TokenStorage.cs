using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using SentjaShared.Models;

namespace SentjaShared.Storage;

public class TokenStorage
{
    private static readonly string TokenPath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
        "Sentja", "token.dat");
    private static readonly byte[] Entropy = Encoding.UTF8.GetBytes("SentjaCloud-v1.0");

    public static void SaveToken(TokenInfo tokenInfo)
    {
        try
        {
            var directory = Path.GetDirectoryName(TokenPath)!;
            Directory.CreateDirectory(directory);
            var json = JsonSerializer.Serialize(tokenInfo);
            var data = Encoding.UTF8.GetBytes(json);
            var encrypted = ProtectedData.Protect(data, Entropy, DataProtectionScope.LocalMachine);
            File.WriteAllBytes(TokenPath, encrypted);
        }
        catch (Exception ex)
        {
            // Fallback: save unencrypted if DPAPI fails
            try
            {
                var directory = Path.GetDirectoryName(TokenPath)!;
                Directory.CreateDirectory(directory);
                var json = JsonSerializer.Serialize(tokenInfo);
                File.WriteAllText(TokenPath + ".json", json);
            }
            catch { }
        }
    }

    public static TokenInfo? LoadToken()
    {
        try
        {
            // Try encrypted first
            if (File.Exists(TokenPath))
            {
                var encrypted = File.ReadAllBytes(TokenPath);
                var data = ProtectedData.Unprotect(encrypted, Entropy, DataProtectionScope.LocalMachine);
                var json = Encoding.UTF8.GetString(data);
                return JsonSerializer.Deserialize<TokenInfo>(json);
            }

            // Fallback: try unencrypted
            var fallbackPath = TokenPath + ".json";
            if (File.Exists(fallbackPath))
            {
                var json = File.ReadAllText(fallbackPath);
                return JsonSerializer.Deserialize<TokenInfo>(json);
            }
        }
        catch { }
        return null;
    }

    public static void ClearToken()
    {
        try { if (File.Exists(TokenPath)) File.Delete(TokenPath); } catch { }
        try { if (File.Exists(TokenPath + ".json")) File.Delete(TokenPath + ".json"); } catch { }
    }
}
