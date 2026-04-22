import * as cdk from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import { Construct } from 'constructs';

export interface GlobalCertStackProps extends cdk.StackProps {
  domainName: string;
  hostedZone: route53.IHostedZone;
}

export class GlobalCertStack extends cdk.Stack {
  public readonly certificate: acm.ICertificate;

  constructor(scope: Construct, id: string, props: GlobalCertStackProps) {
    super(scope, id, props);

    this.certificate = new acm.Certificate(this, 'CloudFrontCert', {
      domainName: props.domainName,
      subjectAlternativeNames: [`*.${props.domainName}`],
      validation: acm.CertificateValidation.fromDns(props.hostedZone),
    });

    new cdk.CfnOutput(this, 'CertificateArn', {
      value: this.certificate.certificateArn,
    });
  }
}
