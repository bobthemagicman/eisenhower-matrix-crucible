# Crucible infrastructure (optional)

A CDK stack for keeping crucible boards in AWS for several people. You only need it for the `s3` and `dynamodb` sources; the page works from local files without it.

| Resource | What it does |
|---|---|
| S3 bucket | `boards/{email}.json` (a user's board) and `inbox/{email}/*.json` (drops from the Slack bot, local collection and the AI skill). Private, encrypted, versioned |
| DynamoDB table | One item per user: partition key `board` = email, the document as a JSON string in `doc` |
| Cognito user pool | Sign-in through the Hosted UI (authorization code + PKCE). No self sign-up: you create the users |
| Cognito identity pool | Turns a signed-in user into short-lived AWS credentials, with their email as a session tag |
| Reader role | Read-only, and only the caller's own board: `boards/${aws:PrincipalTag/email}.json` and the table row whose key is their email. Another user's board is refused by IAM, whatever the page asks for |
| BrazerWriter policy | Attach to whatever runs task-brazer: write any board and inbox drop |

## Deploy

```sh
cd infra
npm install
npx cdk deploy \
  -c domainPrefix=my-crucible \
  -c appUrls=http://localhost:8080/,https://crucible.example.com/
```

- `domainPrefix` names the Hosted UI address, `https://<prefix>.auth.<region>.amazoncognito.com`. It must be globally unique.
- `appUrls` lists every address the page is served from. Sign-in only returns to these, and the bucket only answers browsers from them. Only localhost may use http.

The bucket and the table are kept if the stack is deleted, and the table has deletion protection.

## After deploying

1. **Create the users.** Emails must be lowercase, because the board key is the email exactly:

   ```sh
   aws cognito-idp admin-create-user --user-pool-id <UserPoolId> \
     --username you@example.com \
     --user-attributes Name=email,Value=you@example.com Name=email_verified,Value=true
   ```

   Cognito emails a temporary password; the first sign-in asks for a new one.

2. **Point the page at it.** Copy the `CrucibleConfig` output into `config.js`:

   ```js
   window.CRUCIBLE_CONFIG = { /* the CrucibleConfig output */ };
   ```

   For DynamoDB instead of S3, change `source` to `{ type: 'dynamodb', region, table: <BoardsTableName>, board: '{email}' }`.

3. **Serve the page** from one of the `appUrls`, e.g. `npx serve -l 8080` in the repo root for `http://localhost:8080/`.

4. **Feed it.** Attach the `BrazerWriterPolicyArn` output to the role or user that runs task-brazer, and give task-brazer the bucket and table names.
