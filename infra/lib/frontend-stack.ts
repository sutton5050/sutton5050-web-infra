import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53targets from 'aws-cdk-lib/aws-route53-targets';
import { Construct } from 'constructs';

export interface FrontendStackProps extends cdk.StackProps {
  domainName: string;
  certificate: acm.ICertificate;
  hostedZone: route53.IHostedZone;
}

export class FrontendStack extends cdk.Stack {
  public readonly siteBucket: s3.IBucket;
  public readonly distribution: cloudfront.IDistribution;

  constructor(scope: Construct, id: string, props: FrontendStackProps) {
    super(scope, id, props);

    // S3 bucket for frontend assets — private, CloudFront uses OAC
    const bucket = new s3.Bucket(this, 'FrontendBucket', {
      bucketName: `sutton5050-frontend-${cdk.Aws.ACCOUNT_ID}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });
    this.siteBucket = bucket;

    // CloudFront distribution with OAC
    const distribution = new cloudfront.Distribution(this, 'SiteDistribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        compress: true,
      },
      domainNames: [props.domainName, `www.${props.domainName}`],
      certificate: props.certificate,
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.seconds(0),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.seconds(0),
        },
      ],
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
    });
    this.distribution = distribution;

    // Route53 records
    new route53.ARecord(this, 'SiteAliasRecord', {
      zone: props.hostedZone,
      recordName: props.domainName,
      target: route53.RecordTarget.fromAlias(
        new route53targets.CloudFrontTarget(distribution)
      ),
    });

    new route53.ARecord(this, 'WwwAliasRecord', {
      zone: props.hostedZone,
      recordName: `www.${props.domainName}`,
      target: route53.RecordTarget.fromAlias(
        new route53targets.CloudFrontTarget(distribution)
      ),
    });

    new cdk.CfnOutput(this, 'FrontendBucketName', { value: bucket.bucketName });
    new cdk.CfnOutput(this, 'DistributionId', { value: distribution.distributionId });
    new cdk.CfnOutput(this, 'SiteUrl', { value: `https://${props.domainName}` });
  }
}
