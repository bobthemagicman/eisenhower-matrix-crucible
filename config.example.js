// Copy to config.js (git-ignored) to tell the page where your items live.
// Without config.js the page reads items.js, then items.json, then falls back to the samples.
// A ?data=<url> query parameter overrides everything here, for a JSON file at any web address.
window.CRUCIBLE_CONFIG = {
  // Pick one source.

  // A JSON file beside the page, or at any HTTPS address that allows cross-origin reads.
  source: { type: 'json', url: 'items.json' },

  // An S3 object, read with the signed-in user's credentials.
  // {email} is replaced with the signed-in user's email, so one page serves every user.
  // source: { type: 's3', region: 'us-west-2', bucket: 'my-crucible-data', key: 'boards/{email}.json' },

  // A DynamoDB item, read with the signed-in user's credentials. The table's partition key is
  // `board` (the user's email) and the document is stored as a JSON string in the `doc` attribute.
  // source: { type: 'dynamodb', region: 'us-west-2', table: 'crucible-boards', board: '{email}' },

  // Sign-in for the S3 and DynamoDB sources. Every value comes from the infra stack's outputs
  // (infra/README.md). Not needed for json sources.
  // auth: {
  //   region: 'us-west-2',
  //   userPoolId: 'us-west-2_XXXXXXXXX',
  //   userPoolClientId: 'xxxxxxxxxxxxxxxxxxxxxxxxxx',
  //   identityPoolId: 'us-west-2:00000000-0000-0000-0000-000000000000',
  //   domain: 'https://your-prefix.auth.us-west-2.amazoncognito.com',
  //   identityProvider: 'Google', // go straight to Google Workspace sign-in
  //   // redirectUri defaults to this page's address; it must be listed on the app client.
  // },
};
