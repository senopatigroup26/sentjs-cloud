using System.Text.Json;
using System.Text.Json.Serialization;

namespace SentjaShared.Models;

// Custom converter: handles both string and number for long fields
public class StringToLongConverter : JsonConverter<long>
{
    public override long Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.String)
        {
            var str = reader.GetString()?.Trim();
            return long.TryParse(str, out var val) ? val : 0;
        }
        if (reader.TokenType == JsonTokenType.Number)
            return reader.GetInt64();
        return 0;
    }
    public override void Write(Utf8JsonWriter writer, long value, JsonSerializerOptions options)
        => writer.WriteNumberValue(value);
}

public class CloudFile
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("user_id")]
    public string UserId { get; set; } = string.Empty;

    [JsonPropertyName("device_id")]
    public string DeviceId { get; set; } = string.Empty;

    [JsonPropertyName("file_name")]
    public string FileName { get; set; } = string.Empty;

    [JsonPropertyName("local_path")]
    public string FilePath { get; set; } = string.Empty;

    [JsonPropertyName("remote_path")]
    public string RemotePath { get; set; } = string.Empty;

    [JsonPropertyName("size_bytes")]
    [JsonConverter(typeof(StringToLongConverter))]
    public long FileSize { get; set; }

    [JsonPropertyName("checksum_sha256")]
    public string FileHash { get; set; } = string.Empty;

    [JsonPropertyName("mime_type")]
    public string MimeType { get; set; } = string.Empty;

    [JsonPropertyName("status")]
    public string Status { get; set; } = string.Empty;

    [JsonPropertyName("last_modified_at")]
    public DateTime? LastModified { get; set; }

    [JsonPropertyName("created_at")]
    public DateTime CreatedAt { get; set; }
}

public class FileListRequest
{
    [JsonPropertyName("device_id")]
    public string? DeviceId { get; set; }

    [JsonPropertyName("path")]
    public string? Path { get; set; }

    [JsonPropertyName("page")]
    public int Page { get; set; } = 1;

    [JsonPropertyName("page_size")]
    public int PageSize { get; set; } = 50;
}

public class FileUploadCompleteRequest
{
    [JsonPropertyName("device_id")]
    public string? DeviceId { get; set; }

    [JsonPropertyName("file_name")]
    public string FileName { get; set; } = string.Empty;

    [JsonPropertyName("file_path")]
    public string FilePath { get; set; } = string.Empty;

    [JsonPropertyName("remote_path")]
    public string RemotePath { get; set; } = string.Empty;

    [JsonPropertyName("file_size")]
    public long FileSize { get; set; }

    [JsonPropertyName("file_hash")]
    public string FileHash { get; set; } = string.Empty;

    [JsonPropertyName("mime_type")]
    public string MimeType { get; set; } = string.Empty;
}

public class FileDehydrateRequest
{
    public string FileId { get; set; } = string.Empty;
}

public class FileHydrationInfo
{
    public string FileId { get; set; } = string.Empty;
    public string DownloadUrl { get; set; } = string.Empty;
    public long FileSize { get; set; }
    public string FileHash { get; set; } = string.Empty;
}
