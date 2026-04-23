# sutton5050-sandbox

Full-stack serverless AWS sandbox. React frontend on CloudFront/S3, FastAPI backend on ECS Fargate behind API Gateway, shared-secret Basic Auth.

## Project structure

```
infra/              CDK (TypeScript) — 7 stacks
frontend/           React + Vite + TypeScript
backend/            Python FastAPI in Docker
scripts/            Operational scripts (pause, teardown)
.github/workflows/  CI/CD (deploy.yml, sandbox.yml)
SETUP.md            One-time GitHub Actions setup
```

## AWS account & region

- **Account:** 902672427642
- **Primary region:** eu-west-2 (London)
- **CloudFront cert region:** us-east-1 (required by AWS)

## Domain

- **Domain:** sutton5050.com
- **Hosted zone ID:** Z03151509FL1UXA4XHI7
- **Subdomains:** sutton5050.com (frontend), api.sutton5050.com (API GW)

## CDK stacks (deployment order)

1. **DnsStack** — Route53 hosted zone reference
2. **GlobalCertStack** (us-east-1) — wildcard ACM cert for CloudFront
3. **NetworkStack** — VPC with public subnets only, no NAT
4. **StorageStack** — DynamoDB table, S3 storage bucket, ECR repository
5. **BackendStack** — ECS Fargate, ALB, HTTP API Gateway (auth enforced by FastAPI, not API GW)
6. **FrontendStack** — S3 + CloudFront
7. **OidcStack** — GitHub OIDC provider + IAM role for workflows

## Auth

Shared-secret HTTP Basic Auth. Password lives in:
- GitHub secret `SANDBOX_PASSWORD` (source of truth)
- CDK context at deploy time → ECS task env var `SANDBOX_PASSWORD`

FastAPI middleware (`backend/app/auth/basic.py`) checks the header on every route except `/health`. The React app shows a password form, stores credentials in sessionStorage, and sends them as `Authorization: Basic …`.

## Key resource IDs (currently deployed)

- **ECS cluster:** sutton5050-cluster
- **ECS service:** sutton5050-backend
- **ECR repo:** 902672427642.dkr.ecr.eu-west-2.amazonaws.com/sutton5050-backend
- **Frontend bucket:** sutton5050-frontend-902672427642
- **CloudFront distribution:** E357OFMOGZYTM2
- **DynamoDB table:** sutton5050-app

## Commands

### Deploy

All deploys go through **GitHub Actions → Deploy / Rebuild** (manual or
auto-triggered by pushes to `main`). Local ad-hoc deploys:

```bash
cd infra
SANDBOX_PASSWORD='...' npx cdk deploy --all --require-approval never
```

### Lifecycle (pause / resume / teardown)

Via GitHub Actions → **Sandbox Lifecycle** → choose action.

Local equivalents:
```bash
./scripts/sandbox-pause.sh pause       # scale ECS→0, disable CF (~$29/mo saved)
./scripts/sandbox-pause.sh resume      # reverse of above
./scripts/sandbox-teardown.sh          # destroy Backend + Frontend (~$51/mo saved)
```

After a teardown, run **Deploy / Rebuild** with scope `all` to rebuild.

## Architecture notes

- **No NAT Gateway** — Fargate runs in public subnets with assignPublicIp to save ~$32/mo
- **HTTP API Gateway** (not REST) — 70% cheaper; no JWT authorizer since FastAPI enforces auth itself
- **Fargate on-demand** — Spot removed for deployment stability
- **ALB is internet-facing** in public subnets — API GW + FastAPI Basic Auth is the security boundary
- **ECR repo lives in StorageStack** (not BackendStack) to avoid chicken-and-egg: image must exist before ECS service starts
- **Container health check removed** — relies on ALB target group health check only; `healthCheckGracePeriod` is 120s
- **Docker images must be built for linux/amd64** (`docker buildx build --platform linux/amd64`) since dev machines are ARM (Apple Silicon)
- **OidcStack** is deployed once locally; after that the Deploy workflow manages it like any other stack

## Cost estimate

| State | Monthly cost |
|---|---|
| Running | ~$52 |
| Paused (ECS 0, CF off) | ~$16 (ALB) |
| Torn down (BackendStack + FrontendStack destroyed) | ~$0.50 (Route53) |
