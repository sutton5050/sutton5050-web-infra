import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53targets from 'aws-cdk-lib/aws-route53-targets';
import { Construct } from 'constructs';

export interface AuthStackProps extends cdk.StackProps {
  domainName: string;
  hostedZone: route53.IHostedZone;
  cognitoCertArn?: string;
}

export class AuthStack extends cdk.Stack {
  public readonly userPool: cognito.IUserPool;
  public readonly userPoolClient: cognito.IUserPoolClient;
  public readonly userPoolDomain: cognito.UserPoolDomain;
  public readonly cognitoDomainUrl: string;

  constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id, props);

    const pool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: 'sutton5050-users',
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      passwordPolicy: {
        minLength: 8,
        requireUppercase: true,
        requireLowercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Use custom domain if cert ARN provided, otherwise use Cognito prefix domain
    const useCustomDomain = !!props.cognitoCertArn;

    if (useCustomDomain) {
      const cognitoCert = acm.Certificate.fromCertificateArn(
        this, 'CognitoCert', props.cognitoCertArn!,
      );
      this.userPoolDomain = pool.addDomain('CognitoDomain', {
        customDomain: {
          domainName: `auth.${props.domainName}`,
          certificate: cognitoCert,
        },
      });
      // Route53 alias for auth.{domain} → Cognito CloudFront distribution
      new route53.ARecord(this, 'CognitoAliasRecord', {
        zone: props.hostedZone,
        recordName: `auth.${props.domainName}`,
        target: route53.RecordTarget.fromAlias(
          new route53targets.UserPoolDomainTarget(this.userPoolDomain)
        ),
      });
      this.cognitoDomainUrl = `https://auth.${props.domainName}`;
    } else {
      // Prefix domain — works immediately, no cert needed
      this.userPoolDomain = pool.addDomain('CognitoDomain', {
        cognitoDomain: { domainPrefix: 'sutton5050' },
      });
      this.cognitoDomainUrl = `https://sutton5050.auth.${this.region}.amazoncognito.com`;
    }

    // App client — no secret (PKCE for SPA)
    const client = pool.addClient('WebAppClient', {
      userPoolClientName: 'sutton5050-web',
      generateSecret: false,
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.PROFILE,
        ],
        callbackUrls: [
          `https://${props.domainName}/callback`,
          'http://localhost:5173/callback',
        ],
        logoutUrls: [
          `https://${props.domainName}`,
          'http://localhost:5173',
        ],
      },
      authFlows: {
        userSrp: true,
      },
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(30),
    });

    this.userPool = pool;
    this.userPoolClient = client;

    new cdk.CfnOutput(this, 'UserPoolId', { value: pool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: client.userPoolClientId });
    new cdk.CfnOutput(this, 'CognitoDomainUrl', { value: this.cognitoDomainUrl });
  }
}
