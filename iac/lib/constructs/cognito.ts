import * as cdk from "aws-cdk-lib";
import { aws_cognito, aws_ssm } from "aws-cdk-lib";
import { Construct } from "constructs";
import { config } from "../config.js";

interface Props {
  callbackUrls: string[];
  logoutUrls: string[];
}

export class CognitoConstruct extends Construct {
  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id);

    const userPool = new aws_cognito.UserPool(this, "UserPool", {
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      removalPolicy: cdk.RemovalPolicy.DESTROY, // NOTE: 注意!各自で判断してください!
    });

    const domainPrefix = `mcp-server-${this.node.addr.substring(0, 8)}`;
    userPool.addDomain("Domain", {
      cognitoDomain: {
        domainPrefix,
      },
    });

    const userPoolClient = userPool.addClient("UserPoolClient", {
      generateSecret: true,
      oAuth: {
        callbackUrls: props.callbackUrls,
        logoutUrls: props.logoutUrls,
        flows: { authorizationCodeGrant: true },
        scopes: [
          aws_cognito.OAuthScope.EMAIL,
          aws_cognito.OAuthScope.PROFILE,
          aws_cognito.OAuthScope.OPENID,
        ],
      },
    });

    new aws_ssm.StringParameter(this, "UserPoolId", {
      parameterName: config.parameterStoreKeys.userPoolId,
      stringValue: userPool.userPoolId,
    });

    new aws_ssm.StringParameter(this, "UserPoolClientId", {
      parameterName: config.parameterStoreKeys.userPoolClientId,
      stringValue: userPoolClient.userPoolClientId,
    });

    const region = cdk.Stack.of(this).region;

    new aws_ssm.StringParameter(this, "UserPoolClientSecret", {
      parameterName: config.parameterStoreKeys.userPoolClientSecret,
      stringValue: userPoolClient.userPoolClientSecret.unsafeUnwrap(),
    });

    new aws_ssm.StringParameter(this, "UserPoolDomain", {
      parameterName: config.parameterStoreKeys.userPoolDomain,
      stringValue: `https://${domainPrefix}.auth.${region}.amazoncognito.com`,
    });
  }
}
