import {
  DeleteItemCommand,
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  ScanCommand,
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import type {
  OAuthStorageFactory,
  OAuthStorageInterface,
} from "@cloudflare/workers-oauth-provider";

export interface DynamoDBStorageConfig {
  tableName: string;
  ttlAttributeName?: string;
}

export class DynamoDBStorage implements OAuthStorageInterface {
  private client: DynamoDBClient;
  private tableName: string;
  private ttlAttributeName: string;

  constructor(config: DynamoDBStorageConfig) {
    this.client = new DynamoDBClient({});
    this.tableName = config.tableName;
    this.ttlAttributeName = config.ttlAttributeName || "ttl";
  }

  async get(
    key: string,
    options?: { type: "text" | "json" | "arrayBuffer" | "stream" },
  ): Promise<any> {
    const command = new GetItemCommand({
      TableName: this.tableName,
      Key: marshall({ key }),
      ConsistentRead: true,
    });

    try {
      const response = await this.client.send(command);

      if (!response.Item) {
        return null;
      }

      const item = unmarshall(response.Item);

      if (
        item[this.ttlAttributeName] &&
        item[this.ttlAttributeName] < Math.floor(Date.now() / 1000)
      ) {
        await this.delete(key);
        return null;
      }

      if (options?.type === "json" && item.value) {
        return JSON.parse(item.value);
      }

      return item.value;
    } catch (error) {
      console.error(`Error getting item with key ${key}:`, error);
      return null;
    }
  }

  async put(
    key: string,
    value: string | ArrayBuffer,
    options?: { expirationTtl?: number },
  ): Promise<void> {
    const valueString =
      value instanceof ArrayBuffer
        ? String.fromCharCode.apply(null, Array.from(new Uint8Array(value)))
        : value;

    const item: Record<string, any> = {
      key,
      value: valueString,
    };

    if (options?.expirationTtl) {
      const now = Math.floor(Date.now() / 1000);
      item[this.ttlAttributeName] = now + options.expirationTtl;
    }

    const command = new PutItemCommand({
      TableName: this.tableName,
      Item: marshall(item),
    });

    try {
      await this.client.send(command);
    } catch (error) {
      console.error(`Error putting item with key ${key}:`, error);
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    const command = new DeleteItemCommand({
      TableName: this.tableName,
      Key: marshall({ key }),
    });

    try {
      await this.client.send(command);
    } catch (error) {
      console.error(`Error deleting item with key ${key}:`, error);
      throw error;
    }
  }

  async list(options: {
    prefix: string;
    limit?: number;
    cursor?: string;
  }): Promise<{
    keys: { name: string }[];
    list_complete: boolean;
    cursor?: string;
  }> {
    const { prefix, limit = 1000 } = options;

    const command = new ScanCommand({
      TableName: this.tableName,
      FilterExpression: "begins_with(#k, :prefix)",
      ExpressionAttributeNames: { "#k": "key" },
      ExpressionAttributeValues: marshall({ ":prefix": prefix }),
      Limit: limit,
      ExclusiveStartKey: options.cursor
        ? JSON.parse(Buffer.from(options.cursor, "base64").toString())
        : undefined,
    });

    try {
      const response = await this.client.send(command);

      const keys = (response.Items || []).map((item) => {
        const unmarshalled = unmarshall(item);
        return { name: unmarshalled.key };
      });

      const now = Math.floor(Date.now() / 1000);
      const validKeys = keys.filter((key) => {
        const item = unmarshall(
          // biome-ignore lint/style/noNonNullAssertion: FIXME
          response.Items!.find((i) => unmarshall(i).key === key.name)!,
        );
        return (
          !item[this.ttlAttributeName] || item[this.ttlAttributeName] >= now
        );
      });

      let cursor: string | undefined;
      if (response.LastEvaluatedKey) {
        cursor = Buffer.from(
          JSON.stringify(response.LastEvaluatedKey),
        ).toString("base64");
      }

      return {
        keys: validKeys,
        list_complete: !response.LastEvaluatedKey,
        cursor: cursor,
      };
    } catch (error) {
      console.error(`Error listing items with prefix ${prefix}:`, error);
      throw error;
    }
  }
}

export class DynamoDBStorageFactory implements OAuthStorageFactory {
  private config: DynamoDBStorageConfig;

  constructor(config: DynamoDBStorageConfig) {
    this.config = config;
  }

  createStorage(env: any): OAuthStorageInterface {
    const config = { ...this.config };

    if (env.DYNAMODB_TABLE) {
      config.tableName = env.DYNAMODB_TABLE;
    }

    if (env.DYNAMODB_TTL_ATTRIBUTE) {
      config.ttlAttributeName = env.DYNAMODB_TTL_ATTRIBUTE;
    }

    return new DynamoDBStorage(config);
  }
}
