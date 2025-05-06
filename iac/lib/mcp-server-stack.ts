import { execSync } from "node:child_process";
import * as cdk from "aws-cdk-lib";
import { aws_ssm } from "aws-cdk-lib";
import type { Construct } from "constructs";
import { config } from "./config.js";
import { CognitoConstruct } from "./constructs/cognito.js";
import { ServerConstruct } from "./constructs/server.js";
import { OAuthDynamoDBConstruct } from "./constructs/storage.js";

export class McpServerStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const oauthDB = new OAuthDynamoDBConstruct(this, "OAuthDynamoDB");

    const cookieEncryptionKey = execSync("openssl rand -hex 32")
      .toString()
      .trim();
    new aws_ssm.StringParameter(this, "CookieEncryptionKey", {
      parameterName: config.parameterStoreKeys.cookieEncryptionKey,
      stringValue: cookieEncryptionKey,
    });

    const server = new ServerConstruct(this, "Server", {
      oauthTable: oauthDB.oauthTable,
    });

    new CognitoConstruct(this, "Cognito", {
      callbackUrls: [
        `https://${server.mcpServerUrl}/callback`,
        "http://localhost:8080/callback",
      ],
      logoutUrls: [`https://${server.mcpServerUrl}`],
    });

    new cdk.CfnOutput(this, "McpServerUrl", {
      value: server.mcpServerUrl,
    });
  }
}
