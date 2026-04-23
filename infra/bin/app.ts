#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { DnsStack } from '../lib/dns-stack';
import { GlobalCertStack } from '../lib/global-cert-stack';
import { NetworkStack } from '../lib/network-stack';
import { AuthStack } from '../lib/auth-stack';
import { StorageStack } from '../lib/storage-stack';
import { BackendStack } from '../lib/backend-stack';
import { FrontendStack } from '../lib/frontend-stack';
import { OidcStack } from '../lib/oidc-stack';

const app = new cdk.App();

const domainName = app.node.tryGetContext('domainName');
const hostedZoneId = app.node.tryGetContext('hostedZoneId');
if (!domainName || domainName === 'CHANGE_ME.com') {
  console.warn('⚠️  Set your domain name in cdk.json context or via -c domainName=yourdomain.com');
}

const accountId = '902672427642';
const primaryRegion = 'eu-west-2';
const primaryEnv: cdk.Environment = {
  account: accountId,
  region: primaryRegion,
};
const usEast1Env: cdk.Environment = {
  account: accountId,
  region: 'us-east-1',
};

// DNS — reference existing hosted zone
const dnsStack = new DnsStack(app, 'DnsStack', {
  domainName,
  hostedZoneId,
  env: primaryEnv,
  crossRegionReferences: true,
});

// CloudFront requires ACM cert in us-east-1
const globalCertStack = new GlobalCertStack(app, 'GlobalCertStack', {
  domainName,
  hostedZone: dnsStack.hostedZone,
  env: usEast1Env,
  crossRegionReferences: true,
});

// VPC — public subnets only, no NAT
const networkStack = new NetworkStack(app, 'NetworkStack', {
  env: primaryEnv,
});

// Cognito — needs the us-east-1 wildcard cert ARN for custom domain
// After deploying GlobalCertStack, set cognitoCertArn in cdk.json
const cognitoCertArn = app.node.tryGetContext('cognitoCertArn');
const authStack = new AuthStack(app, 'AuthStack', {
  domainName,
  hostedZone: dnsStack.hostedZone,
  cognitoCertArn,
  env: primaryEnv,
});

// DynamoDB + S3
const storageStack = new StorageStack(app, 'StorageStack', {
  domainName,
  env: primaryEnv,
});

// ECS Fargate + API Gateway
const backendStack = new BackendStack(app, 'BackendStack', {
  domainName,
  vpc: networkStack.vpc,
  userPool: authStack.userPool,
  userPoolClient: authStack.userPoolClient,
  table: storageStack.table,
  storageBucket: storageStack.storageBucket,
  ecrRepository: storageStack.ecrRepository,
  hostedZone: dnsStack.hostedZone,
  env: primaryEnv,
});

// S3 + CloudFront
const frontendStack = new FrontendStack(app, 'FrontendStack', {
  domainName,
  certificate: globalCertStack.certificate,
  hostedZone: dnsStack.hostedZone,
  env: primaryEnv,
  crossRegionReferences: true,
});

// GitHub OIDC provider + IAM role assumed by Actions workflows
const githubOrg = app.node.tryGetContext('githubOrg') ?? 'sutton5050';
const githubRepo = app.node.tryGetContext('githubRepo') ?? 'sutton5050-web-infra';
const oidcStack = new OidcStack(app, 'OidcStack', {
  githubOrg,
  githubRepo,
  env: primaryEnv,
});

app.synth();
