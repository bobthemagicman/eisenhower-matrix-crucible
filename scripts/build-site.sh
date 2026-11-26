#!/usr/bin/env bash
# Builds the static site into site/: the page, the sample items, lib/, schema/, and config.js
# written from CRUCIBLE_CONFIG (the infra stack's CrucibleConfig output: identifiers only, no
# secrets). Nobody's items are ever built in: they live in S3 or DynamoDB.
# Used by amplify.yml and scripts/deploy-site.sh.
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf site && mkdir -p site
cp index.html sample-items.js site/
cp -R lib schema site/
node -e 'const raw=process.env.CRUCIBLE_CONFIG;
if(!raw){console.error("Set the CRUCIBLE_CONFIG environment variable to the stack CrucibleConfig output.");process.exit(1)}
const c=JSON.parse(raw);
if(!c.source||!c.auth){console.error("CRUCIBLE_CONFIG needs source and auth.");process.exit(1)}
require("fs").writeFileSync("site/config.js","window.CRUCIBLE_CONFIG = "+JSON.stringify(c)+";\n")'
