# GitHub Actions Setup

One-time setup to wire up CI/CD for deploy, pause, resume, teardown, and rebuild.

## 1. Bootstrap CDK (first time only)

```bash
cd infra
npm install
npx cdk bootstrap aws://902672427642/eu-west-2
npx cdk bootstrap aws://902672427642/us-east-1
```

## 2. Deploy the OIDC stack

`OidcStack` creates the GitHub OIDC provider and the IAM role assumed by every
workflow. Deploy it locally the first time — afterwards it will be managed by
`deploy-infra.yml` like every other stack.

```bash
cd infra
npx cdk deploy OidcStack --require-approval never
```

Grab the role ARN from the output (or query later):

```bash
aws cloudformation describe-stacks \
  --stack-name OidcStack \
  --region eu-west-2 \
  --query "Stacks[0].Outputs[?OutputKey=='RoleArn'].OutputValue" \
  --output text
```

Expected format: `arn:aws:iam::902672427642:role/sutton5050-github-actions`

## 3. Add GitHub repo secrets

GitHub repo → **Settings → Secrets and variables → Actions → Secrets → New repository secret**:

| Secret          | Value                                                      |
|-----------------|------------------------------------------------------------|
| `AWS_ROLE_ARN`  | The OidcStack role ARN from step 2                         |

## 4. Add GitHub repo variables

Same screen → **Variables** tab → **New repository variable**:

| Variable                      | Value                                                             |
|-------------------------------|-------------------------------------------------------------------|
| `ECS_CLUSTER_NAME`            | `sutton5050-cluster`                                              |
| `ECS_SERVICE_NAME`            | `sutton5050-backend`                                              |
| `FRONTEND_BUCKET_NAME`        | `sutton5050-frontend-902672427642`                                |
| `CLOUDFRONT_DISTRIBUTION_ID`  | `E357OFMOGZYTM2`                                                  |
| `VITE_API_URL`                | `https://api.sutton5050.com`                                      |
| `VITE_COGNITO_REGION`         | `eu-west-2`                                                       |
| `VITE_COGNITO_USER_POOL_ID`   | `eu-west-2_6NruGuxIP`                                             |
| `VITE_COGNITO_APP_CLIENT_ID`  | `4v0d5253q6h9vvnrb1o9vmbn95`                                      |
| `VITE_COGNITO_DOMAIN`         | `sutton5050.auth.eu-west-2.amazoncognito.com`                     |
| `VITE_APP_DOMAIN`             | `sutton5050.com`                                                  |

After a teardown + rebuild, `CLOUDFRONT_DISTRIBUTION_ID` changes — update it from the rebuild logs (the `DistributionId` CfnOutput of FrontendStack).

## 5. Test the workflows

Trigger each from GitHub repo → **Actions** tab → select workflow → **Run workflow**.

Recommended order:
1. **Deploy Infrastructure** — should be a no-op diff if everything is already deployed.
2. **Pause Sandbox** — scale to zero, disable CloudFront. Verify ECS desired count is 0.
3. **Resume Sandbox** — scale back up. Wait ~5 min for CloudFront to re-enable.

## Workflows at a glance

| Workflow                | Trigger                          | What it does                                                 |
|-------------------------|----------------------------------|--------------------------------------------------------------|
| `deploy-infra.yml`      | push to `main` (`infra/**`), manual | `cdk deploy --all`                                           |
| `deploy-backend.yml`    | push to `main` (`backend/**`), manual | Build + push image to ECR, force new ECS deployment, wait stable |
| `deploy-frontend.yml`   | push to `main` (`frontend/**`), manual | Build Vite bundle, sync to S3, invalidate CloudFront       |
| `pause.yml`             | manual                           | Scale ECS → 0, disable CloudFront (~$29/mo saved)            |
| `resume.yml`            | manual                           | Scale ECS → 1, enable CloudFront                             |
| `teardown.yml`          | manual (typed `DESTROY` confirm) | Destroy Backend + Frontend stacks (~$51/mo saved, ~$0.50/mo remaining) |
| `rebuild.yml`           | manual                           | Reverses teardown: redeploy stacks + push image + sync frontend |

## IAM role permissions (what the role can do)

Scoped to the minimum needed:

- **CDK deploy/destroy** — `sts:AssumeRole` on `arn:aws:iam::<account>:role/cdk-*`
- **ECR push/pull** — on repos matching `sutton5050-*`
- **ECS** — `UpdateService`, `Describe*` (all resources — ECS ARNs contain non-deterministic IDs)
- **S3** — read/write/delete on `sutton5050-frontend-<account>` only
- **CloudFront** — invalidations, get/update distribution config

Trust policy is scoped to this repo: `repo:sutton5050/sutton5050-web-infra:*`.

## Troubleshooting

**`Error: Not authorized to perform sts:AssumeRoleWithWebIdentity`**
→ The OIDC provider exists but trust policy doesn't match. Verify the repo
slug in `infra/cdk.json` matches the GitHub repo URL exactly (org + repo name).

**CDK deploy says `CDKToolkit` doesn't exist**
→ Region wasn't bootstrapped. Run `npx cdk bootstrap aws://<account>/<region>` locally.

**BackendStack deploy fails with `Cannot pull image` or `ResourceNotFoundException`**
→ No image in ECR yet. Run `deploy-backend.yml` first (or `rebuild.yml`, which
pushes an image before deploying the stack).
