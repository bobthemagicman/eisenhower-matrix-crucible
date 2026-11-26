# Crucible infrastructure (optional)

A CDK stack for keeping crucible boards in AWS for several people. You only need it for the `s3` and `dynamodb` sources; the page works from local files without it.

| Resource | What it does |
|---|---|
| S3 bucket | `boards/{email}.json` (a user's board) and `inbox/{email}/*.json` (drops from the Slack bot, local collection and the AI skill). Private, encrypted, versioned |
| DynamoDB table | One item per user: partition key `board` = email, the document as a JSON string in `doc` |
| Cognito user pool | Sign-in with Google only, limited to one Google Workspace domain (authorization code + PKCE). No passwords, no self sign-up, no admin-created users |
| Pre-sign-up trigger | Admits a Google account only when Google's `hd` claim and its verified email both match your Workspace domain. Personal Gmail accounts, other domains and every non-Google path are refused. Fails closed |
| Cognito identity pool | Turns a signed-in user into short-lived AWS credentials, with their email as a session tag |
| Reader role | Read-only, and only the caller's own board: `boards/${aws:PrincipalTag/email}.json` and the table row whose key is their email. Another user's board is refused by IAM, whatever the page asks for |
| BrazerWriter policy | Attach to whatever runs task-brazer: write any board and inbox drop |

## Before you deploy: a Google OAuth client

Sign-in goes through Google, so the stack needs an OAuth client from your Workspace's Google Cloud project.

1. Work out the redirect URI. The Hosted UI prefix defaults to `matrix-crucible-` plus the first 10 hex characters of the SHA-256 of your AWS account ID:

   ```sh
   node -e 'console.log("https://matrix-crucible-"+require("crypto").createHash("sha256").update("<account id>").digest("hex").slice(0,10)+".auth.<region>.amazoncognito.com/oauth2/idpresponse")'
   ```

2. In Google Cloud console, APIs & Services: set the OAuth consent screen's user type to **Internal** (only your Workspace's accounts can even reach the consent page), then Credentials > Create credentials > OAuth client ID > **Web application**, with the URI from step 1 under **Authorized redirect URIs**.

3. Store the client in Secrets Manager, in the account and region you deploy to. Run this in your own terminal so the secret never lands in a log or chat:

   ```sh
   aws secretsmanager create-secret --name crucible/google-oauth-client \
     --secret-string '{"clientId":"<id>.apps.googleusercontent.com","clientSecret":"<secret>"}'
   ```

## Deploy

```sh
cd infra
npm install
npx cdk deploy --profile <profile> \
  -c allowedEmailDomain=example.com \
  -c appUrls=https://matrix.example.com/,http://localhost:8080/
```

- `allowedEmailDomain` is the Google Workspace domain allowed in. There is no default: without it the stack refuses to build.
- `appUrls` lists every address the page is served from. Sign-in only returns to these, and the bucket only answers browsers from them. Only localhost may use http.
- Optional: `-c domainPrefix=...` to choose the Hosted UI prefix yourself, `-c googleSecretName=...` for a different secret name.

The bucket and the table are kept if the stack is deleted, and the table has deletion protection.

## After deploying

1. **Check the redirect URI.** The `GoogleRedirectUri` output must match what you put on the Google OAuth client. Nobody needs creating: anyone in the Workspace domain can sign in, and their board is keyed by their email.

2. **Point the page at it.** Copy the `CrucibleConfig` output into `config.js`:

   ```js
   window.CRUCIBLE_CONFIG = { /* the CrucibleConfig output */ };
   ```

   For DynamoDB instead of S3, change `source` to `{ type: 'dynamodb', region, table: <BoardsTableName>, board: '{email}' }`.

3. **Serve the page** from one of the `appUrls`, e.g. `npx serve -l 8080` in the repo root for `http://localhost:8080/`.

4. **Feed it.** Attach the `BrazerWriterPolicyArn` output to the role or user that runs task-brazer, and give task-brazer the bucket and table names.
