import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface OidcStackProps extends cdk.StackProps {
  githubOrg: string;
  githubRepo: string;
  roleName?: string;
}

// GitHub OIDC provider + IAM role assumed by the GitHub Actions workflows in this repo.
// The role's ARN is exported as a CfnOutput — set it as the `AWS_ROLE_ARN` repo secret.
export class OidcStack extends cdk.Stack {
  public readonly role: iam.Role;

  constructor(scope: Construct, id: string, props: OidcStackProps) {
    super(scope, id, props);

    const provider = new iam.OpenIdConnectProvider(this, 'GitHubOidcProvider', {
      url: 'https://token.actions.githubusercontent.com',
      clientIds: ['sts.amazonaws.com'],
    });
    // The OIDC provider is an account-global singleton — don't delete it on stack destroy.
    (provider.node.defaultChild as cdk.CfnResource).applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);

    const subject = `repo:${props.githubOrg}/${props.githubRepo}:*`;

    const role = new iam.Role(this, 'GitHubActionsRole', {
      roleName: props.roleName ?? 'sutton5050-github-actions',
      description: `Assumed by GitHub Actions in ${props.githubOrg}/${props.githubRepo}`,
      maxSessionDuration: cdk.Duration.hours(1),
      assumedBy: new iam.FederatedPrincipal(
        provider.openIdConnectProviderArn,
        {
          StringEquals: {
            'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
          },
          StringLike: {
            'token.actions.githubusercontent.com:sub': subject,
          },
        },
        'sts:AssumeRoleWithWebIdentity',
      ),
    });

    // CDK deploy/destroy — assume the bootstrap roles created by `cdk bootstrap`.
    role.addToPolicy(new iam.PolicyStatement({
      sid: 'CdkBootstrapRoles',
      actions: ['sts:AssumeRole'],
      resources: [`arn:aws:iam::${cdk.Aws.ACCOUNT_ID}:role/cdk-*`],
    }));

    // ECR — token + push/pull for the backend repo.
    role.addToPolicy(new iam.PolicyStatement({
      sid: 'EcrAuthToken',
      actions: ['ecr:GetAuthorizationToken'],
      resources: ['*'],
    }));
    role.addToPolicy(new iam.PolicyStatement({
      sid: 'EcrPushPull',
      actions: [
        'ecr:BatchCheckLayerAvailability',
        'ecr:BatchGetImage',
        'ecr:CompleteLayerUpload',
        'ecr:DescribeImages',
        'ecr:DescribeRepositories',
        'ecr:GetDownloadUrlForLayer',
        'ecr:InitiateLayerUpload',
        'ecr:PutImage',
        'ecr:UploadLayerPart',
      ],
      resources: [`arn:aws:ecr:*:${cdk.Aws.ACCOUNT_ID}:repository/sutton5050-*`],
    }));

    // ECS — update service (deploy, pause, resume).
    role.addToPolicy(new iam.PolicyStatement({
      sid: 'EcsUpdateService',
      actions: [
        'ecs:DescribeClusters',
        'ecs:DescribeServices',
        'ecs:DescribeTasks',
        'ecs:ListTasks',
        'ecs:UpdateService',
      ],
      resources: ['*'],
    }));

    // S3 — frontend bucket only (sync + delete).
    role.addToPolicy(new iam.PolicyStatement({
      sid: 'S3FrontendBucket',
      actions: [
        's3:DeleteObject',
        's3:GetObject',
        's3:ListBucket',
        's3:PutObject',
      ],
      resources: [
        `arn:aws:s3:::sutton5050-frontend-${cdk.Aws.ACCOUNT_ID}`,
        `arn:aws:s3:::sutton5050-frontend-${cdk.Aws.ACCOUNT_ID}/*`,
      ],
    }));

    // CloudFront — invalidations (deploy) + enable/disable (pause/resume).
    role.addToPolicy(new iam.PolicyStatement({
      sid: 'CloudFrontOps',
      actions: [
        'cloudfront:CreateInvalidation',
        'cloudfront:GetDistribution',
        'cloudfront:GetDistributionConfig',
        'cloudfront:ListDistributions',
        'cloudfront:UpdateDistribution',
      ],
      resources: ['*'],
    }));

    this.role = role;

    new cdk.CfnOutput(this, 'RoleArn', {
      value: role.roleArn,
      description: 'Set this as the AWS_ROLE_ARN GitHub repository secret',
    });
  }
}
