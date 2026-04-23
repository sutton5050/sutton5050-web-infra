#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────
# sandbox-teardown.sh
#
# Destroys ALL paid stacks to bring the monthly cost to ~$0.50
# (Route53 hosted zone only). Keeps foundational stacks that
# are free and hold state you don't want to lose.
#
# Destroyed (saves ~$52/mo):
#   - BackendStack  (ECS, ALB, API GW domain, VPC Link)
#   - FrontendStack (CloudFront, S3 frontend bucket)
#
# Preserved (free / holds state):
#   - DnsStack       (Route53 hosted zone ref — $0.50/mo)
#   - GlobalCertStack (ACM cert — free)
#   - NetworkStack   (VPC — free, no NAT)
#   - AuthStack      (Cognito — free <50K MAU, holds users)
#   - StorageStack   (DynamoDB + S3 + ECR — pennies, holds data)
#
# To rebuild:
#   npx cdk deploy BackendStack FrontendStack --require-approval broadening
#   Then push backend image + frontend assets.
# ─────────────────────────────────────────────────────────────

REGION="${AWS_REGION:-eu-west-2}"
SKIP_CONFIRM="${SKIP_CONFIRM:-false}"

echo "🗑  Full teardown of paid stacks..."
echo ""
echo "This will DESTROY:"
echo "  • BackendStack  (ECS, ALB, API Gateway, VPC Link)"
echo "  • FrontendStack (CloudFront, S3 frontend bucket)"
echo ""
echo "These are preserved (free, hold state):"
echo "  • DnsStack, GlobalCertStack, NetworkStack"
echo "  • AuthStack (Cognito users), StorageStack (DynamoDB data, S3 files, ECR images)"
echo ""

if [[ "$SKIP_CONFIRM" != "true" ]]; then
  read -p "Continue? [y/N] " -n 1 -r
  echo ""
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
  fi
fi

echo ""
echo "→ Destroying FrontendStack..."
cd "$(dirname "$0")/../infra"
npx cdk destroy FrontendStack --force

echo ""
echo "→ Destroying BackendStack..."
npx cdk destroy BackendStack --force

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✓ Teardown complete."
echo ""
echo "  Monthly cost: ~\$0.50 (Route53 only)"
echo ""
echo "  To rebuild:"
echo "    cd infra"
echo "    npx cdk deploy BackendStack FrontendStack --require-approval broadening"
echo "    # Then push backend image + frontend assets"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
