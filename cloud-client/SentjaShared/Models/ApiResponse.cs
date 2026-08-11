using System.Text.Json;
using System.Text.Json.Serialization;

namespace SentjaShared.Models;

public class ApiResponse<T>
{
    [JsonPropertyName("success")]
    public bool Success { get; set; }

    [JsonPropertyName("data")]
    public T? Data { get; set; }

    [JsonPropertyName("meta")]
    public ApiMeta? Meta { get; set; }

    [JsonPropertyName("error")]
    public object? ErrorObject { get; set; }

    [JsonIgnore]
    public string? Error
    {
        get
        {
            if (ErrorObject == null) return null;
            if (ErrorObject is string str) return str;
            if (ErrorObject is JsonElement element)
            {
                if (element.ValueKind == JsonValueKind.String)
                    return element.GetString();
                if (element.TryGetProperty("message", out var msg))
                    return msg.GetString();
                return element.ToString();
            }
            return ErrorObject.ToString();
        }
        set => ErrorObject = value;
    }

    [JsonPropertyName("message")]
    public string? Message { get; set; }
}

public class ApiMeta
{
    [JsonPropertyName("pagination")]
    public PaginationMeta? Pagination { get; set; }
}

public class PaginationMeta
{
    [JsonPropertyName("total")]
    public int Total { get; set; }

    [JsonPropertyName("page")]
    public int Page { get; set; }

    [JsonPropertyName("limit")]
    public int Limit { get; set; }

    [JsonPropertyName("total_pages")]
    public int TotalPages { get; set; }
}

// Backend returns data as direct array with meta separate
// ApiResponse<List<CloudFile>> for file list
public class PaginatedResponse<T>
{
    [JsonPropertyName("data")]
    public List<T> Data { get; set; } = new();

    [JsonPropertyName("total")]
    public int Total { get; set; }

    [JsonPropertyName("page")]
    public int Page { get; set; }

    [JsonPropertyName("page_size")]
    public int PageSize { get; set; }
}
