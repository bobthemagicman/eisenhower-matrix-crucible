#!/usr/bin/env node
import { App } from 'aws-cdk-lib';
import { CrucibleStack } from '../lib/crucible-stack.js';

// npx cdk deploy --profile <p> -c allowedEmailDomain=example.com -c appUrls=https://matrix.example.com/,http://localhost:8080/
const app = new App();
const ctx = (k: string) => app.node.tryGetContext(k) as string | undefined;

// No fallback: a pool for a placeholder domain would admit nobody, and an empty one must never mean "anyone".
const allowedEmailDomain = ctx('allowedEmailDomain')?.trim().toLowerCase();
if (!allowedEmailDomain || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(allowedEmailDomain)) {
  throw new Error('Set the Google Workspace domain allowed to sign in: -c allowedEmailDomain=example.com');
}

const domainPrefix = ctx('domainPrefix');
if (domainPrefix !== undefined && (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(domainPrefix) || /aws|amazon|cognito/.test(domainPrefix))) {
  throw new Error('domainPrefix: lowercase letters, digits and dashes; globally unique; must not contain aws, amazon or cognito.');
}

const appUrls = String(ctx('appUrls') ?? 'http://localhost:8080/').split(',').map(s => s.trim()).filter(Boolean);
for (const u of appUrls) {
  const url = new URL(u);
  if (url.protocol !== 'https:' && url.hostname !== 'localhost') throw new Error(`appUrls: ${u} must be https (only localhost may use http).`);
}

const boardStore = ctx('boardStore') ?? 's3';
if (boardStore !== 's3' && boardStore !== 'dynamodb') throw new Error('boardStore: s3 or dynamodb.');

new CrucibleStack(app, ctx('stackName') ?? 'EisenhowerMatrixCrucible', {
  appUrls,
  allowedEmailDomain,
  googleSecretName: ctx('googleSecretName') ?? 'crucible/google-oauth-client',
  domainPrefix,
  boardStore,
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});
