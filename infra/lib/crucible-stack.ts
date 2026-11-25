import { CfnOutput, Duration, RemovalPolicy, Stack, Tags, type StackProps } from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import type { Construct } from 'constructs';

export interface CrucibleStackProps extends StackProps {
  /** Every address the page is served from, e.g. http://localhost:8080/. Sign-in returns only to these. */
  appUrls: string[];
  /** Globally unique prefix for the Cognito Hosted UI address: https://<prefix>.auth.<region>.amazoncognito.com. */
  domainPrefix: string;
}

// IAM policy variable for the signed-in user's email, set from their ID token by the identity pool.
const USER_EMAIL = '${aws:PrincipalTag/email}';

/**
 * Data and sign-in for the Eisenhower matrix crucible, for many users:
 * - an S3 bucket (boards/{email}.json, inbox/{email}/*.json) and a DynamoDB table (key `board` = email);
 * - a Cognito user pool (admin-created users, Hosted UI, code + PKCE) and an identity pool that maps the
 *   user's email to a session tag, so the read-only role reaches only that user's own board;
 * - a managed policy for task-brazer to write boards and inbox drops.
 */
export class CrucibleStack extends Stack {
  constructor(scope: Construct, id: string, props: CrucibleStackProps) {
    super(scope, id, props);
    Tags.of(this).add('crucible', 'eisenhower-matrix-crucible');

    const origins = [...new Set(props.appUrls.map(u => new URL(u).origin))];

    const bucket = new s3.Bucket(this, 'Data', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      lifecycleRules: [{ noncurrentVersionExpiration: Duration.days(30) }],
      cors: [{ allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.HEAD], allowedOrigins: origins, allowedHeaders: ['*'], exposedHeaders: ['ETag'], maxAge: 3000 }],
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const table = new dynamodb.TableV2(this, 'Boards', {
      partitionKey: { name: 'board', type: dynamodb.AttributeType.STRING },
      billing: dynamodb.Billing.onDemand(),
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      deletionProtection: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const userPool = new cognito.UserPool(this, 'Users', {
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: { email: { required: true, mutable: true } },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      mfa: cognito.Mfa.OPTIONAL,
      mfaSecondFactor: { sms: false, otp: true },
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const domain = userPool.addDomain('HostedUi', {
      cognitoDomain: { domainPrefix: props.domainPrefix },
      managedLoginVersion: cognito.ManagedLoginVersion.CLASSIC_HOSTED_UI,
    });
    const client = userPool.addClient('Web', {
      generateSecret: false,
      authFlows: {},
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL],
        callbackUrls: props.appUrls,
        logoutUrls: props.appUrls,
      },
      supportedIdentityProviders: [cognito.UserPoolClientIdentityProvider.COGNITO],
      preventUserExistenceErrors: true,
      idTokenValidity: Duration.hours(1),
      accessTokenValidity: Duration.hours(1),
      refreshTokenValidity: Duration.days(7),
    });

    const identityPool = new cognito.CfnIdentityPool(this, 'Identities', {
      allowUnauthenticatedIdentities: false,
      cognitoIdentityProviders: [{ clientId: client.userPoolClientId, providerName: userPool.userPoolProviderName, serverSideTokenCheck: true }],
    });
    // The user's email claim becomes the `email` session tag that the read policy below checks.
    new cognito.CfnIdentityPoolPrincipalTag(this, 'EmailTag', {
      identityPoolId: identityPool.ref,
      identityProviderName: userPool.userPoolProviderName,
      principalTags: { email: 'email' },
      useDefaults: false,
    });

    const reader = new iam.Role(this, 'Reader', {
      description: 'Signed-in crucible users: read your own board only.',
      maxSessionDuration: Duration.hours(1),
      assumedBy: new iam.FederatedPrincipal(
        'cognito-identity.amazonaws.com',
        {
          StringEquals: { 'cognito-identity.amazonaws.com:aud': identityPool.ref },
          'ForAnyValue:StringLike': { 'cognito-identity.amazonaws.com:amr': 'authenticated' },
        },
        'sts:AssumeRoleWithWebIdentity',
      ).withSessionTags(),
    });
    reader.addToPolicy(new iam.PolicyStatement({ actions: ['s3:GetObject'], resources: [bucket.arnForObjects(`boards/${USER_EMAIL}.json`)] }));
    reader.addToPolicy(new iam.PolicyStatement({
      actions: ['dynamodb:GetItem'],
      resources: [table.tableArn],
      conditions: { 'ForAllValues:StringEquals': { 'dynamodb:LeadingKeys': [USER_EMAIL] } },
    }));
    new cognito.CfnIdentityPoolRoleAttachment(this, 'Roles', { identityPoolId: identityPool.ref, roles: { authenticated: reader.roleArn } });

    const writer = new iam.ManagedPolicy(this, 'BrazerWriter', {
      description: 'task-brazer: write crucible boards and inbox drops for every user.',
      statements: [
        new iam.PolicyStatement({ actions: ['s3:GetObject', 's3:PutObject'], resources: [bucket.arnForObjects('boards/*'), bucket.arnForObjects('inbox/*')] }),
        new iam.PolicyStatement({ actions: ['s3:ListBucket'], resources: [bucket.bucketArn], conditions: { StringLike: { 's3:prefix': ['boards/*', 'inbox/*'] } } }),
        new iam.PolicyStatement({ actions: ['dynamodb:GetItem', 'dynamodb:PutItem'], resources: [table.tableArn] }),
      ],
    });

    const hostedUi = domain.baseUrl();
    new CfnOutput(this, 'DataBucketName', { value: bucket.bucketName });
    new CfnOutput(this, 'BoardsTableName', { value: table.tableName });
    new CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new CfnOutput(this, 'UserPoolClientId', { value: client.userPoolClientId });
    new CfnOutput(this, 'IdentityPoolId', { value: identityPool.ref });
    new CfnOutput(this, 'HostedUiDomain', { value: hostedUi });
    new CfnOutput(this, 'BrazerWriterPolicyArn', { value: writer.managedPolicyArn });
    new CfnOutput(this, 'CrucibleConfig', {
      description: 'Paste into config.js as window.CRUCIBLE_CONFIG = <this>;',
      value: this.toJsonString({
        source: { type: 's3', region: this.region, bucket: bucket.bucketName, key: 'boards/{email}.json' },
        auth: { region: this.region, userPoolId: userPool.userPoolId, userPoolClientId: client.userPoolClientId, identityPoolId: identityPool.ref, domain: hostedUi },
      }),
    });
  }
}
