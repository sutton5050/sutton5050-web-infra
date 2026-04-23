#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────
# sandbox-pause.sh / sandbox-resume.sh
#
# Pauses or resumes all paid AWS resources in the sutton5050
# multi-stack deployment.
#
# Idle cost breakdown (what this script eliminates):
#   ECS Fargate task   ~$29/mo
#   ALB                ~$16/mo
#   VPC Link           ~$7/mo  (HTTP API VPC Links are cheaper)
#   ─────────────────────────
#   Total saved        ~$52/mo
#
# Resources left running (free or pennies):
#   Route53 hosted zone        $0.50/mo (fixed)
#   DynamoDB on-demand         $0 idle
#   S3 buckets                 pennies
#   Cognito User Pool          free (<50K MAU)
#   API Gateway HTTP API       $0 idle (per-request only)
#   ACM certificates           free
#   CloudFront distribution    ~$0 idle
#   CloudWatch Logs            <$1/mo
#   VPC (no NAT)               free
#   ECR repo                   pennies
#
# Usage:
#   ./scripts/sandbox-pause.sh          # scale down / pause
#   ./scripts/sandbox-resume.sh         # scale up / resume
# ─────────────────────────────────────────────────────────────

REGION="${AWS_REGION:-eu-west-2}"
CLUSTER="${ECS_CLUSTER_NAME:-sutton5050-cluster}"
SERVICE="${ECS_SERVICE_NAME:-sutton5050-backend}"
CLOUDFRONT_ID="${CLOUDFRONT_DISTRIBUTION_ID:-E357OFMOGZYTM2}"

ACTION="${1:-pause}"

pause() {
  echo "⏸  Pausing sutton5050 sandbox..."
  echo ""

  # 1. Scale ECS service to 0 tasks (~$29/mo saved)
  echo "→ Scaling ECS service to 0 desired tasks..."
  aws ecs update-service \
    --cluster "$CLUSTER" \
    --service "$SERVICE" \
    --desired-count 0 \
    --region "$REGION" \
    --query "service.{name:serviceName,desired:desiredCount,status:status}" \
    --output table
  echo "  ✓ ECS tasks will drain in ~30s"
  echo ""

  # 2. Disable CloudFront distribution (stops edge charges, keeps config)
  echo "→ Disabling CloudFront distribution..."
  ETAG=$(aws cloudfront get-distribution-config \
    --id "$CLOUDFRONT_ID" \
    --query "ETag" --output text)

  aws cloudfront get-distribution-config \
    --id "$CLOUDFRONT_ID" \
    --query "DistributionConfig" \
    --output json \
    | python3 -c "
import sys, json
config = json.load(sys.stdin)
config['Enabled'] = False
json.dump(config, sys.stdout)
" | aws cloudfront update-distribution \
    --id "$CLOUDFRONT_ID" \
    --if-match "$ETAG" \
    --distribution-config file:///dev/stdin \
    --query "Distribution.{Id:Id,Status:Status,Enabled:DistributionConfig.Enabled}" \
    --output table
  echo "  ✓ CloudFront disabled (takes ~5 min to propagate)"
  echo ""

  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "✓ Sandbox paused."
  echo ""
  echo "  Stopped:    ECS tasks, CloudFront"
  echo "  Still up:   ALB, API GW, VPC, Cognito, DynamoDB, S3, Route53"
  echo ""
  echo "  Note: The ALB (~\$16/mo) stays up so BackendStack doesn't"
  echo "  need a full redeploy on resume. Delete BackendStack entirely"
  echo "  to eliminate it (see sandbox-teardown.sh)."
  echo ""
  echo "  To resume:  ./scripts/sandbox-resume.sh"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

resume() {
  echo "▶  Resuming sutton5050 sandbox..."
  echo ""

  # 1. Scale ECS service back to 1
  echo "→ Scaling ECS service to 1 desired task..."
  aws ecs update-service \
    --cluster "$CLUSTER" \
    --service "$SERVICE" \
    --desired-count 1 \
    --region "$REGION" \
    --query "service.{name:serviceName,desired:desiredCount,status:status}" \
    --output table
  echo "  ✓ Task will be running in ~60s"
  echo ""

  # 2. Re-enable CloudFront distribution
  echo "→ Enabling CloudFront distribution..."
  ETAG=$(aws cloudfront get-distribution-config \
    --id "$CLOUDFRONT_ID" \
    --query "ETag" --output text)

  aws cloudfront get-distribution-config \
    --id "$CLOUDFRONT_ID" \
    --query "DistributionConfig" \
    --output json \
    | python3 -c "
import sys, json
config = json.load(sys.stdin)
config['Enabled'] = True
json.dump(config, sys.stdout)
" | aws cloudfront update-distribution \
    --id "$CLOUDFRONT_ID" \
    --if-match "$ETAG" \
    --distribution-config file:///dev/stdin \
    --query "Distribution.{Id:Id,Status:Status,Enabled:DistributionConfig.Enabled}" \
    --output table
  echo "  ✓ CloudFront re-enabled (takes ~5 min to propagate)"
  echo ""

  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "✓ Sandbox resumed."
  echo "  Site: https://sutton5050.com"
  echo "  API:  https://api.sutton5050.com/health"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

case "$ACTION" in
  pause)  pause  ;;
  resume) resume ;;
  *)
    echo "Usage: $0 [pause|resume]"
    exit 1
    ;;
esac
