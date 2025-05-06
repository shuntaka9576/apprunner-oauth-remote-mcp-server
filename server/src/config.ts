import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";

interface Config {
  mcpServer: string;
  userPoolId: string;
  userPoolClientId: string;
  userPoolClientSecret: string;
  userPoolDomain: string;
  cookieEncryptionKey: string;
  oauthTableName: string;
  port: number;
}

const PORT = process.env.PORT ? Number(process.env.PORT) : 8080;
const storeKeyMcpServer = process.env.STORE_KEY_MCP_SERVER_URL || "";
const storeKeyUserPoolId = process.env.STORE_KEY_USER_POOL_ID || "";
const storeKeyUserPoolClientId =
  process.env.STORE_KEY_USER_POOL_CLIENT_ID || "";
const storeKeyUserPoolClientSecret =
  process.env.STORE_KEY_USER_POOL_CLIENT_SECRET || "";
const storeKeyUserPoolDomain = process.env.STORE_KEY_USER_POOL_DOMAIN || "";
const storeKeyCookieEncryptionKey =
  process.env.STORE_KEY_COOKIE_ENCRYPTION_KEY || "";
const storeKeyOauthTableName = process.env.STORE_KEY_OAUTH_TABLE_NAME || "";

const ssmClient = new SSMClient();

const getParameter = async (name: string): Promise<string> => {
  const command = new GetParameterCommand({
    Name: name,
    WithDecryption: true,
  });

  try {
    const response = await ssmClient.send(command);
    return response.Parameter?.Value || "";
  } catch (error) {
    console.error(`Error fetching parameter ${name}:`, error);

    return "dummy"; // FIXME: 初回デプロイ時パラメータが存在しないため
  }
};

const config = await (async (): Promise<Config> => {
  try {
    const [
      mcpServerKeyUrl,
      userPoolId,
      userPoolClientId,
      userPoolClientSecret,
      userPoolDomain,
      cookieEncryptionKey,
      oauthTableName,
    ] = await Promise.all([
      getParameter(storeKeyMcpServer),
      getParameter(storeKeyUserPoolId),
      getParameter(storeKeyUserPoolClientId),
      getParameter(storeKeyUserPoolClientSecret),
      getParameter(storeKeyUserPoolDomain),
      getParameter(storeKeyCookieEncryptionKey),
      getParameter(storeKeyOauthTableName),
    ]);

    const mcpServer =
      process.env.NODE_ENV === "production"
        ? `https://${mcpServerKeyUrl}`
        : "http://localhost:8080";

    return {
      mcpServer,
      userPoolId,
      userPoolClientId,
      userPoolClientSecret,
      userPoolDomain,
      cookieEncryptionKey,
      oauthTableName,
      port: PORT,
    };
  } catch (error) {
    console.error("設定の初期化に失敗しました:", error);
    throw error;
  }
})();

export default config;
