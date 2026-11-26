#!/usr/bin/env bash
# Publishes the site to an Amplify Hosting app by manual upload, with no Git connection: reads
# CrucibleConfig from the deployed infra stack, builds site/, zips it and deploys it to the branch.
#
#   scripts/deploy-site.sh --app-id <amplify app id> [--branch main] [--stack EisenhowerMatrixCrucible] \
#     [--profile <aws profile>] [--region <region>]
set -euo pipefail
cd "$(dirname "$0")/.."

branch=main stack=EisenhowerMatrixCrucible app=
aws_args=()
while [ $# -gt 0 ]; do
  case "$1" in
    --app-id) app=$2; shift 2 ;;
    --branch) branch=$2; shift 2 ;;
    --stack) stack=$2; shift 2 ;;
    --profile|--region) aws_args+=("$1" "$2"); shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done
[ -n "$app" ] || { echo "Pass --app-id <amplify app id>." >&2; exit 2; }
aws() { command aws "${aws_args[@]}" "$@"; }

CRUCIBLE_CONFIG=$(aws cloudformation describe-stacks --stack-name "$stack" \
  --query "Stacks[0].Outputs[?OutputKey=='CrucibleConfig'].OutputValue" --output text)
[ -n "$CRUCIBLE_CONFIG" ] && [ "$CRUCIBLE_CONFIG" != None ] || { echo "Stack $stack has no CrucibleConfig output." >&2; exit 1; }
export CRUCIBLE_CONFIG
scripts/build-site.sh

tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
(cd site && zip -qr "$tmp/site.zip" .)

read -r job url < <(aws amplify create-deployment --app-id "$app" --branch-name "$branch" --query '[jobId,zipUploadUrl]' --output text)
curl -sS --fail -X PUT -T "$tmp/site.zip" "$url"
aws amplify start-deployment --app-id "$app" --branch-name "$branch" --job-id "$job" >/dev/null

while :; do
  status=$(aws amplify get-job --app-id "$app" --branch-name "$branch" --job-id "$job" --query job.summary.status --output text)
  case "$status" in
    SUCCEED) echo "Deployed job $job to $branch."; break ;;
    FAILED|CANCELLED) echo "Deployment $job $status." >&2; exit 1 ;;
    *) sleep 3 ;;
  esac
done
