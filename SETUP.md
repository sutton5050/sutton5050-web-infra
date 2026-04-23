# GitHub Actions Setup

One-time setup to wire up CI/CD for deploy, pause, resume, and teardown.

## 1. Bootstrap CDK (first time only)

```bash
cd infra
npm install
npx cdk bootstrap aws://902672427642/eu-west-2
npx cdk bootstrap aws://902672427642/us-east-1
```

## 2. Deploy the OIDC stack

`OidcStack` creates the GitHub OIDC provider and the IAM role assumed by
every workflow. Deploy it locally the first time — afterwards the Deploy
workflow manages it.

```bash
cd infra
npx cdk deploy OidcStack --require-approval never
```

Grab the role ARN:

```bash
aws cloudformation describe-stacks \
  --stack-name OidcStack \
  --region eu-west-2 \
  --query "Stacks[0].Outputs[?OutputKey=='RoleArn'].OutputValue" \
  --output text
```

Expected format: `arn:aws:iam::902672427642:role/sutton5050-github-actions`

## 3. Destroy the old AuthStack (migration only)

If you previously deployed `AuthStack` (Cognito), destroy it — it's no
longer part of the app:

```bash
cd infra
npx cdk destroy AuthStack --force
```

Skip this if `AuthStack` was never deployed.

## 4. Add GitHub repo secrets

GitHub repo → **Settings → Secrets and variables → Actions → Secrets →
New repository secret**:

| Secret             | Value                                                     |
|--------------------|-----------------------------------------------------------|
| `AWS_ROLE_ARN`     | The OidcStack role ARN from step 2                        |
| `SANDBOX_PASSWORD` | The shared password for the Basic Auth gate. Pick anything strong — it protects the API and the React login form. |

## 5. Add GitHub repo variables

Same screen → **Variables** tab:

| Variable                      | Value                                             |
|-------------------------------|---------------------------------------------------|
| `ECS_CLUSTER_NAME`            | `sutton5050-cluster`                              |
| `ECS_SERVICE_NAME`            | `sutton5050-backend`                              |
| `FRONTEND_BUCKET_NAME`        | `sutton5050-frontend-902672427642`                |
| `CLOUDFRONT_DISTRIBUTION_ID`  | `E357OFMOGZYTM2`                                  |
| `VITE_API_URL`                | `https://api.sutton5050.com`                      |
| `VITE_APP_DOMAIN`             | `sutton5050.com`                                  |

You can delete any old `VITE_COGNITO_*` variables — they're no longer used.

After a teardown + full rebuild, `CLOUDFRONT_DISTRIBUTION_ID` changes —
update it from the `DistributionId` CfnOutput in the rebuild logs.

## 6. First deploy

Trigger **Deploy / Rebuild** from the Actions tab with scope `all`. This
builds the backend image, deploys every stack, then syncs the frontend.

## Workflows at a glance

| Workflow            | Trigger                                   | What it does |
|---------------------|-------------------------------------------|--------------|
| `deploy.yml`        | push to main (infra/backend/frontend), manual | Build+push backend image, cdk deploy stacks, sync frontend. Manual runs can scope to `infra` / `backend` / `frontend` / `all`. |
| `sandbox.yml`       | manual                                    | Lifecycle ops. Input `action`: `pause` (ECS→0, CF off, ~$29/mo saved) / `resume` / `teardown` (destroys Backend+Frontend stacks, ~$51/mo saved — requires typing `DESTROY` in the confirm input). |

After a teardown, run **Deploy / Rebuild** with scope `all` to rebuild.

## Auth model

Shared-secret HTTP Basic Auth. One username (`sandbox`) + one password
(`SANDBOX_PASSWORD` secret). FastAPI middleware gates every API route
except `/health`. The React app shows a password form on first visit,
stores credentials in sessionStorage, and sends them as
`Authorization: Basic …` on every API call.

This is deliberately lightweight — suitable for an experimentation
sandbox. Upgrade to OAuth / Cognito if real user data lands here.

## IAM role permissions (what the role can do)

Scoped to the minimum needed:

- **CDK deploy/destroy** — `sts:AssumeRole` on `arn:aws:iam::<account>:role/cdk-*`
- **ECR push/pull** — on repos matching `sutton5050-*`
- **ECS** — `UpdateService`, `Describe*`
- **S3** — read/write/delete on `sutton5050-frontend-<account>` only
- **CloudFront** — invalidations, get/update distribution config

Trust policy is scoped to this repo: `repo:sutton5050/sutton5050-web-infra:*`.

## Troubleshooting

**`Error: Not authorized to perform sts:AssumeRoleWithWebIdentity`**
→ The OIDC provider exists but the trust policy doesn't match the repo.
Verify `githubOrg` / `githubRepo` in `infra/cdk.json`.

**CDK deploy: `CDKToolkit` doesn't exist**
→ Region wasn't bootstrapped. Run `npx cdk bootstrap aws://<account>/<region>` locally.

**BackendStack deploy fails with `Cannot pull image`**
→ No image in ECR yet. Run **Deploy / Rebuild** with scope `all` (or `backend`)
— it pushes an image before deploying the stack.

**Backend returns `503 Auth not configured`**
→ `SANDBOX_PASSWORD` secret isn't set, or isn't reaching the ECS container.
Confirm the secret exists and rerun **Deploy / Rebuild** with scope `backend`.
