import path from "node:path";
import * as apprunner from "@aws-cdk/aws-apprunner-alpha";
import * as cdk from "aws-cdk-lib";
import { aws_iam } from "aws-cdk-lib";
import type { aws_dynamodb } from "aws-cdk-lib";
import * as assets from "aws-cdk-lib/aws-ecr-assets";
import { Construct } from "constructs";
import { config } from "../config.js";

export class ServerConstruct extends Construct {
  public readonly mcpServerUrl: string;

  constructor(
    scope: Construct,
    id: string,
    props: { oauthTable: aws_dynamodb.Table },
  ) {
    super(scope, id);

    const imageAsset = new assets.DockerImageAsset(this, "ImageAssets", {
      directory: path.join("__dirname", "../../"),
      platform: assets.Platform.LINUX_AMD64,
    });

    const app = new apprunner.Service(this, "Service", {
      source: apprunner.Source.fromAsset({
        imageConfiguration: {
          port: 8080,
          environmentVariables: {
            STORE_KEY_MCP_SERVER_URL: config.parameterStoreKeys.mcpServer,
            STORE_KEY_USER_POOL_ID: config.parameterStoreKeys.userPoolId,
            STORE_KEY_USER_POOL_CLIENT_ID:
              config.parameterStoreKeys.userPoolClientId,
            STORE_KEY_USER_POOL_CLIENT_SECRET:
              config.parameterStoreKeys.userPoolClientSecret,
            STORE_KEY_USER_POOL_DOMAIN:
              config.parameterStoreKeys.userPoolDomain,
            STORE_KEY_COOKIE_ENCRYPTION_KEY:
              config.parameterStoreKeys.cookieEncryptionKey,
            STORE_KEY_OAUTH_TABLE_NAME:
              config.parameterStoreKeys.oauthTableName,
            PORT: "8080",
          },
        },
        asset: imageAsset,
      }),
      autoDeploymentsEnabled: true,
    });

    this.mcpServerUrl = app.serviceUrl;
    new cdk.aws_ssm.StringParameter(this, "McpServerLambdaUrl", {
      parameterName: config.parameterStoreKeys.mcpServer,
      stringValue: this.mcpServerUrl,
    });

    props.oauthTable.grantReadWriteData(app);

    const region = cdk.Stack.of(this).region;
    const account = cdk.Stack.of(this).account;

    app.addToRolePolicy(
      new aws_iam.PolicyStatement({
        effect: aws_iam.Effect.ALLOW,
        actions: ["ssm:GetParameter"],
        resources: [
          `arn:aws:ssm:${region}:${account}:parameter${config.parameterStoreKeys.mcpServer}`,
          `arn:aws:ssm:${region}:${account}:parameter${config.parameterStoreKeys.userPoolId}`,
          `arn:aws:ssm:${region}:${account}:parameter${config.parameterStoreKeys.userPoolClientId}`,
          `arn:aws:ssm:${region}:${account}:parameter${config.parameterStoreKeys.userPoolClientSecret}`,
          `arn:aws:ssm:${region}:${account}:parameter${config.parameterStoreKeys.userPoolDomain}`,
          `arn:aws:ssm:${region}:${account}:parameter${config.parameterStoreKeys.cookieEncryptionKey}`,
          `arn:aws:ssm:${region}:${account}:parameter${config.parameterStoreKeys.oauthTableName}`,
        ],
      }),
    );
  }
}
