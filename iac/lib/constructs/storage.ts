import * as cdk from "aws-cdk-lib";
import { aws_dynamodb, aws_ssm } from "aws-cdk-lib";
import { Construct } from "constructs";
import { config } from "../config.js";

export class OAuthDynamoDBConstruct extends Construct {
  public readonly oauthTable: aws_dynamodb.Table;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    const tableName = "oauth";
    this.oauthTable = new aws_dynamodb.Table(this, "OAuthTable", {
      tableName,
      partitionKey: {
        name: "key",
        type: aws_dynamodb.AttributeType.STRING,
      },
      billingMode: aws_dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // NOTE: 注意!各自で判断してください!
      timeToLiveAttribute: "ttl",
    });

    new aws_ssm.StringParameter(this, "OAuthTableName", {
      parameterName: config.parameterStoreKeys.oauthTableName,
      stringValue: tableName,
    });
  }
}
