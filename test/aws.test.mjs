// node --test. Checks the SigV4 signer against AWS's published example
// (IAM ListUsers, https://docs.aws.amazon.com/IAM/latest/UserGuide/create-signed-request.html).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signRequest } from '../lib/aws.mjs';

const creds = { accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY' };

test('signs the AWS documentation example exactly', async () => {
  const h = await signRequest({
    url: 'https://iam.amazonaws.com/?Action=ListUsers&Version=2010-05-08',
    service: 'iam',
    region: 'us-east-1',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8' },
    creds,
    now: new Date('2015-08-30T12:36:00Z'),
  });
  assert.equal(h['x-amz-date'], '20150830T123600Z');
  assert.equal(
    h.authorization,
    'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/iam/aws4_request, SignedHeaders=content-type;host;x-amz-date, Signature=5d672d79c15b13162d9279b0855cfba6789a8edb4c82c400e06b5924a6f2b5d7',
  );
  assert.equal(h.host, undefined, 'the browser sets Host itself');
});

test('adds the session token and the S3 payload hash when asked', async () => {
  const h = await signRequest({
    url: 'https://bucket.s3.us-west-2.amazonaws.com/boards/someone@example.com.json',
    service: 's3',
    region: 'us-west-2',
    creds: { ...creds, sessionToken: 'TOKEN' },
    contentSha256: true,
    now: new Date('2026-11-25T00:00:00Z'),
  });
  assert.equal(h['x-amz-security-token'], 'TOKEN');
  assert.equal(h['x-amz-content-sha256'], 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.match(h.authorization, /SignedHeaders=host;x-amz-content-sha256;x-amz-date;x-amz-security-token,/);
});
