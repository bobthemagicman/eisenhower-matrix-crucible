#!/usr/bin/env node
import { App } from 'aws-cdk-lib';
import { CrucibleStack } from '../lib/crucible-stack.js';

const app = new App();
const domainPrefix = app.node.tryGetContext('domainPrefix') as string | undefined;
if (!domainPrefix || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(domainPrefix) || /aws|amazon|cognito/.test(domainPrefix)) {
  throw new Error('Set a Hosted UI prefix: -c domainPrefix=my-crucible (lowercase letters, digits, dashes; globally unique; must not contain aws, amazon or cognito).');
}
const appUrls = String(app.node.tryGetContext('appUrls') ?? 'http://localhost:8080/').split(',').map(s => s.trim()).filter(Boolean);
for (const u of appUrls) {
  const url = new URL(u);
  if (url.protocol !== 'https:' && url.hostname !== 'localhost') throw new Error(`appUrls: ${u} must be https (only localhost may use http).`);
}

new CrucibleStack(app, String(app.node.tryGetContext('stackName') ?? 'EisenhowerMatrixCrucible'), {
  appUrls,
  domainPrefix,
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});
