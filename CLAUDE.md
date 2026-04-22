# sutton5050-sandbox

Full-stack serverless AWS sandbox platform. React frontend on CloudFront/S3, FastAPI backend on ECS Fargate behind API Gateway, Cognito auth with OAuth2 PKCE.

## Project structure

```
infra/           CDK (TypeScript) — 7 stacks
frontend/        React + Vite + TypeScript
backend/         Python FastAPI in Docker
scripts/         Operational scripts (pause, teardown)
.github/workflows/  CI/CD (frontend, backend, infra)
```

## AWS account & region

- **Account:** 902672427642
- **Primary region:** eu-west-2 (London)
- **CloudFront cert region:** us-east-1 (required by AWS)

## Domain

- **Domain:** sutton5050.com
- **Hosted zone ID:** Z03151509FL1UXA4XHI7
- **Subdomains:** sutton5050.com (frontend), api.sutton5050.com (API GW), auth via Cognito prefix domain

## CDK stacks (deployment order)

1. **DnsStack** — Route53 hosted zone reference
2. **GlobalCertStack** (us-east-1) — wildcard ACM cert for CloudFront
3. **NetworkStack** — VPC with public subnets only, no NAT
4. **AuthStack** — Cognito User Pool, prefix domain, OAuth2 app client
5. **StorageStack** — DynamoDB table, S3 storage bucket, ECR repository
6. **BackendStack** — ECS Fargate, ALB, HTTP API Gateway, JWT authorizer
7. **FrontendStack** — S3 + CloudFront

## Key resource IDs (currently deployed)

- **User Pool ID:** eu-west-2_6NruGuxIP
- **App Client ID:** 4v0d5253q6h9vvnrb1o9vmbn95
- **Cognito domain:** sutton5050.auth.eu-west-2.amazoncognito.com
- **ECS cluster:** sutton5050-cluster
- **ECS service:** sutton5050-backend
- **ECR repo:** 902672427642.dkr.ecr.eu-west-2.amazonaws.com/sutton5050-backend
- **Frontend bucket:** sutton5050-frontend-902672427642
- **CloudFront distribution:** E357OFMOGZYTM2
- **DynamoDB table:** sutton5050-app

## Commands

### Deploy all infrastructure from scratch

```bash
cd infra && npm install
npx cdk bootstrap aws://902672427642/eu-west-2
npx cdk bootstrap aws://902672427642/us-east-1
npx cdk deploy DnsStack GlobalCertStack --require-approval broadening
npx cdk deploy NetworkStack AuthStack StorageStack --require-approval broadening
# Push backend image to ECR BEFORE deploying BackendStack:
aws ecr get-login-password --region eu-west-2 | docker login --username AWS --password-stdin 902672427642.dkr.ecr.eu-west-2.amazonaws.com
cd .. && docker buildx build --platform linux/amd64 -t 902672427642.dkr.ecr.eu-west-2.amazonaws.com/sutton5050-backend:latest backend/ --push
cd infra && npx cdk deploy BackendStack --require-approval broadening
npx cdk deploy FrontendStack --require-approval broadening
```

### Deploy backend changes

```bash
cd /path/to/sutton5050_web
docker buildx build --platform linux/amd64 -t 902672427642.dkr.ecr.eu-west-2.amazonaws.com/sutton5050-backend:latest backend/ --push
aws ecs update-service --cluster sutton5050-cluster --service sutton5050-backend --force-new-deployment --region eu-west-2
```

### Deploy frontend changes

```bash
cd frontend
VITE_API_URL=https://api.sutton5050.com \
VITE_COGNITO_REGION=eu-west-2 \
VITE_COGNITO_USER_POOL_ID=eu-west-2_6NruGuxIP \
VITE_COGNITO_APP_CLIENT_ID=4v0d5253q6h9vvnrb1o9vmbn95 \
VITE_COGNITO_DOMAIN=sutton5050.auth.eu-west-2.amazoncognito.com \
VITE_APP_DOMAIN=sutton5050.com \
npm run build
aws s3 sync dist/ s3://sutton5050-frontend-902672427642 --delete
aws cloudfront create-invalidation --distribution-id E357OFMOGZYTM2 --paths "/*"
```

### Pause sandbox (saves ~$29/mo, keeps ALB running for fast resume)

```bash
./scripts/sandbox-pause.sh pause
```

### Resume sandbox

```bash
./scripts/sandbox-pause.sh resume
```

### Full teardown (saves ~$52/mo, reduces to ~$0.50/mo)

```bash
./scripts/sandbox-teardown.sh
```

Destroys BackendStack + FrontendStack. Preserves Cognito users, DynamoDB data, S3 files, ECR images. Rebuild with:

```bash
cd infra && npx cdk deploy BackendStack FrontendStack --require-approval broadening
# Then push backend image + frontend assets (see deploy commands above)
```

## Architecture notes

- **No NAT Gateway** — Fargate runs in public subnets with assignPublicIp to save ~$32/mo
- **HTTP API Gateway** (not REST) — 70% cheaper, native JWT authorizer
- **Fargate on-demand** — Spot removed for deployment stability; re-add in backend-stack.ts if desired
- **ALB is internet-facing** in public subnets — API GW + JWT authorizer is the security boundary
- **ECR repo lives in StorageStack** (not BackendStack) to avoid chicken-and-egg: image must exist before ECS service starts
- **Cognito uses prefix domain** (sutton5050.auth.eu-west-2.amazoncognito.com) — custom domain (auth.sutton5050.com) can be enabled by renaming `_cognitoCertArn_ENABLE_LATER` to `cognitoCertArn` in cdk.json and redeploying AuthStack
- **Container health check removed** — relies on ALB target group health check only; healthCheckGracePeriod is 120s
- **Docker images must be built for linux/amd64** (`docker buildx build --platform linux/amd64`) since dev machines are ARM (Apple Silicon)

## Cost estimate

| State | Monthly cost |
|---|---|
| Running | ~$52 |
| Paused (ECS 0, CF off) | ~$16 (ALB) |
| Torn down (BackendStack + FrontendStack destroyed) | ~$0.50 (Route53) |
