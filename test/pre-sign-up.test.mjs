// The pre-sign-up trigger is inline code in the CDK stack; run it here against the cases that matter.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const src = readFileSync('infra/lib/crucible-stack.ts', 'utf8').match(/const PRE_SIGN_UP = `([\s\S]*?)`;/)[1];
const load = domain => {
  const exports = {};
  runInNewContext(src, { exports, process: { env: domain === undefined ? {} : { ALLOW_DOMAIN: domain } } });
  return exports.handler;
};
const ev = (attrs, source = 'PreSignUp_ExternalProvider') => ({ triggerSource: source, request: { userAttributes: attrs } });
const ok = { 'custom:hd': 'example.com', email: 'Pat@Example.com', email_verified: 'true' };

test('admits a verified Workspace account in the domain', async () => {
  const e = ev(ok);
  assert.equal(await load('example.com')(e), e);
});

for (const [name, e] of [
  ['a consumer Google account (no hd) with an address in the domain', ev({ email: 'pat@example.com', email_verified: 'true' })],
  ['another Workspace domain', ev({ ...ok, 'custom:hd': 'other.com', email: 'pat@other.com' })],
  ['a matching hd but an outside email', ev({ ...ok, email: 'pat@gmail.com' })],
  ['an unverified email', ev({ ...ok, email_verified: 'false' })],
  ['a non-federated sign-up', ev(ok, 'PreSignUp_SignUp')],
  ['an admin-created user', ev(ok, 'PreSignUp_AdminCreateUser')],
]) {
  test(`refuses ${name}`, async () => {
    await assert.rejects(load('example.com')(e), /ONLY_ALLOWED_DOMAIN/);
  });
}

test('refuses everyone when the domain setting is missing', async () => {
  await assert.rejects(load(undefined)(ev(ok)), /ONLY_ALLOWED_DOMAIN/);
  await assert.rejects(load('')(ev(ok)), /ONLY_ALLOWED_DOMAIN/);
});
