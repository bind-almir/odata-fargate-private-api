using Amazon;
using Amazon.SecretsManager.Extensions.Caching;
namespace Sample.SecretsManager;

public class DbSecretsManager
{
  private SecretsManagerCache cache = new SecretsManagerCache();

  public async Task<string> GetSecretAsync(string secretName, RegionEndpoint region)
  {
    string dbSecretString = await cache.GetSecretString(secretName);
    return dbSecretString;
  }
}

