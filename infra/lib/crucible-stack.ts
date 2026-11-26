import { CfnOutput, Duration, RemovalPolicy, SecretValue, Stack, Tags, Token, type StackProps } from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import type { Construct } from 'constructs';
import { createHash } from 'node:crypto';

export interface CrucibleStackProps extends StackProps {
  /** Every address the page is served from, e.g. https://matrix.example.com/. Sign-in returns only to these. */
  appUrls: string[];
  /** The Google Workspace domain allowed to sign in, e.g. example.com. Nobody else gets in. */
  allowedEmailDomain: string;
  /** Secrets Manager secret holding {"clientId": ..., "clientSecret": ...} for the Google OAuth client. */
  googleSecretName: string;
  /** Hosted UI prefix. Defaults to `matrix-crucible-<hash of the account>`, which names neither the account nor the owner. */
  domainPrefix?: string;
}

/** Cognito's name for the Google provider; the page passes it as identity_provider to skip Cognito's chooser. */
export const GOOGLE_PROVIDER_NAME = 'GoogleWorkspace'; // "Google" is reserved for Cognito's built-in provider type

// IAM policy variable for the signed-in user's email, set from their ID token by the identity pool.
const USER_EMAIL = '${aws:PrincipalTag/email}';

// Pre-sign-up trigger: admits only Google Workspace accounts in the allowed domain. Every check fails
// closed. `custom:hd` is Google's hosted-domain claim, which only Workspace accounts carry, so a consumer
// Google account using an address in the domain is refused too.
const PRE_SIGN_UP = `
exports.handler = async (event) => {
  const domain = (process.env.ALLOW_DOMAIN || '').toLowerCase();
  if (!domain) throw new Error('ONLY_ALLOWED_DOMAIN');
  if (event.triggerSource !== 'PreSignUp_ExternalProvider') throw new Error('ONLY_ALLOWED_DOMAIN');
  const a = event.request.userAttributes || {};
  const hd = (a['custom:hd'] || '').toLowerCase();
  const email = (a.email || '').toLowerCase();
  if (hd !== domain || !email.endsWith('@' + domain) || a.email_verified === 'false') throw new Error('ONLY_ALLOWED_DOMAIN');
  return event;
};`;

/**
 * Data and sign-in for the Eisenhower matrix crucible, for everyone in one Google Workspace:
 * - an S3 bucket (boards/{email}.json, inbox/{email}/*.json) and a DynamoDB table (key `board` = email);
 * - a Cognito user pool whose only way in is Google, limited to one Workspace domain by a pre-sign-up
 *   trigger (the same design as content-forge's auth stack);
 * - an identity pool that maps the user's email to a session tag, so the read-only role reaches only
 *   that user's own board;
 * - a managed policy for task-brazer to write boards and inbox drops.
 */
export class CrucibleStack extends Stack {
  constructor(scope: Construct, id: string, props: CrucibleStackProps) {
    super(scope, id, props);
    Tags.of(this).add('crucible', 'eisenhower-matrix-crucible');
    if (!props.domainPrefix && Token.isUnresolved(this.account)) {
      throw new Error('CrucibleStack needs a concrete account (a profile or CDK_DEFAULT_ACCOUNT) to derive the Hosted UI prefix, or pass -c domainPrefix=...');
    }
    const domainPrefix = props.domainPrefix ?? `matrix-crucible-${createHash('sha256').update(this.account).digest('hex').slice(0, 10)}`;
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

    const preSignUp = new lambda.Function(this, 'PreSignUp', {
      description: 'Crucible sign-in: admit only Google Workspace accounts in the allowed domain.',
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      handler: 'index.handler',
      code: lambda.Code.fromInline(PRE_SIGN_UP),
      memorySize: 128,
      // Cognito waits 5 seconds for a trigger.
      timeout: Duration.seconds(5),
      environment: { ALLOW_DOMAIN: props.allowedEmailDomain },
      logGroup: new logs.LogGroup(this, 'PreSignUpLogs', { retention: logs.RetentionDays.TWO_WEEKS, removalPolicy: RemovalPolicy.DESTROY }),
    });

    const userPool = new cognito.UserPool(this, 'Users', {
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      standardAttributes: { email: { required: true, mutable: true } },
      // Google's hosted-domain claim. Mutable, because Cognito rewrites mapped attributes on every federated sign-in.
      customAttributes: { hd: new cognito.StringAttribute({ maxLen: 253, mutable: true }) },
      accountRecovery: cognito.AccountRecovery.NONE,
      mfa: cognito.Mfa.OFF,
      lambdaTriggers: { preSignUp },
      deletionProtection: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // Google as a generic OIDC provider, not Cognito's built-in one: only OIDC providers can map the `hd`
    // claim. The secret is resolved by CloudFormation at deploy time and never appears in the template.
    const google = new cognito.UserPoolIdentityProviderOidc(this, 'Google', {
      userPool,
      name: GOOGLE_PROVIDER_NAME,
      clientId: SecretValue.secretsManager(props.googleSecretName, { jsonField: 'clientId' }).unsafeUnwrap(),
      clientSecret: SecretValue.secretsManager(props.googleSecretName, { jsonField: 'clientSecret' }).unsafeUnwrap(),
      issuerUrl: 'https://accounts.google.com',
      scopes: ['openid', 'email', 'profile'],
      attributeMapping: {
        email: cognito.ProviderAttribute.other('email'),
        emailVerified: cognito.ProviderAttribute.other('email_verified'),
        fullname: cognito.ProviderAttribute.other('name'),
        custom: { 'custom:hd': cognito.ProviderAttribute.other('hd') },
      },
    });

    userPool.addDomain('HostedUi', { cognitoDomain: { domainPrefix }, managedLoginVersion: cognito.ManagedLoginVersion.CLASSIC_HOSTED_UI });
    const client = userPool.addClient('Web', {
      generateSecret: false,
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL],
        callbackUrls: props.appUrls,
        logoutUrls: props.appUrls,
      },
      // Google is the only way in: no Cognito sign-in form.
      supportedIdentityProviders: [cognito.UserPoolClientIdentityProvider.custom(GOOGLE_PROVIDER_NAME)],
      preventUserExistenceErrors: true,
      idTokenValidity: Duration.hours(1),
      accessTokenValidity: Duration.hours(1),
      refreshTokenValidity: Duration.days(7),
    });
    client.node.addDependency(google);
    // Only refresh: no password (SRP) or custom flows. CDK leaves ExplicitAuthFlows unset when none is
    // chosen, and Cognito's default for an unset value includes SRP and custom auth.
    (client.node.defaultChild as cognito.CfnUserPoolClient).explicitAuthFlows = ['ALLOW_REFRESH_TOKEN_AUTH'];

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

    const hostedUi = `https://${domainPrefix}.auth.${this.region}.amazoncognito.com`;
    new CfnOutput(this, 'DataBucketName', { value: bucket.bucketName });
    new CfnOutput(this, 'BoardsTableName', { value: table.tableName });
    new CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new CfnOutput(this, 'UserPoolClientId', { value: client.userPoolClientId });
    new CfnOutput(this, 'IdentityPoolId', { value: identityPool.ref });
    new CfnOutput(this, 'HostedUiDomain', { value: hostedUi });
    new CfnOutput(this, 'AllowedEmailDomain', { value: props.allowedEmailDomain });
    new CfnOutput(this, 'GoogleRedirectUri', { value: `${hostedUi}/oauth2/idpresponse`, description: "Add to the Google OAuth client's authorized redirect URIs" });
    new CfnOutput(this, 'BrazerWriterPolicyArn', { value: writer.managedPolicyArn });
    new CfnOutput(this, 'CrucibleConfig', {
      description: 'Paste into config.js as window.CRUCIBLE_CONFIG = <this>; or set it as CRUCIBLE_CONFIG on Amplify Hosting.',
      value: this.toJsonString({
        source: { type: 's3', region: this.region, bucket: bucket.bucketName, key: 'boards/{email}.json' },
        auth: { region: this.region, userPoolId: userPool.userPoolId, userPoolClientId: client.userPoolClientId, identityPoolId: identityPool.ref, domain: hostedUi, identityProvider: GOOGLE_PROVIDER_NAME },
      }),
    });
  }
}
