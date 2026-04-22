import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53targets from 'aws-cdk-lib/aws-route53-targets';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { Construct } from 'constructs';

export interface BackendStackProps extends cdk.StackProps {
  domainName: string;
  vpc: ec2.IVpc;
  userPool: cognito.IUserPool;
  userPoolClient: cognito.IUserPoolClient;
  table: dynamodb.ITable;
  storageBucket: s3.IBucket;
  ecrRepository: ecr.IRepository;
  hostedZone: route53.IHostedZone;
}

export class BackendStack extends cdk.Stack {
  public readonly ecrRepository: ecr.IRepository;
  public readonly ecsCluster: ecs.ICluster;
  public readonly ecsService: ecs.FargateService;
  public readonly apiUrl: string;

  constructor(scope: Construct, id: string, props: BackendStackProps) {
    super(scope, id, props);

    // ECR Repository — created in StorageStack, passed in as prop
    const repo = props.ecrRepository;

    // ECS Cluster
    const cluster = new ecs.Cluster(this, 'BackendCluster', {
      clusterName: 'sutton5050-cluster',
      vpc: props.vpc,
      enableFargateCapacityProviders: true,
    });
    this.ecsCluster = cluster;

    // Task Definition
    const taskDef = new ecs.FargateTaskDefinition(this, 'BackendTaskDef', {
      cpu: 256,
      memoryLimitMiB: 512,
    });

    // Grant DynamoDB + S3 access to task role
    props.table.grantReadWriteData(taskDef.taskRole);
    props.storageBucket.grantReadWrite(taskDef.taskRole);

    const container = taskDef.addContainer('backend', {
      image: ecs.ContainerImage.fromEcrRepository(repo, 'latest'),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'backend',
        logGroup: new logs.LogGroup(this, 'BackendLogs', {
          logGroupName: '/ecs/sutton5050-backend',
          retention: logs.RetentionDays.ONE_WEEK,
          removalPolicy: cdk.RemovalPolicy.DESTROY,
        }),
      }),
      environment: {
        AWS_DEFAULT_REGION: this.region,
        DYNAMODB_TABLE_NAME: props.table.tableName,
        S3_BUCKET_NAME: props.storageBucket.bucketName,
        COGNITO_USER_POOL_ID: props.userPool.userPoolId,
        COGNITO_APP_CLIENT_ID: props.userPoolClient.userPoolClientId,
        COGNITO_REGION: this.region,
      },
      // Health check handled by ALB target group — no container-level check needed
    });

    container.addPortMappings({ containerPort: 8000 });

    // Security Group for Fargate tasks
    const serviceSg = new ec2.SecurityGroup(this, 'ServiceSg', {
      vpc: props.vpc,
      description: 'Backend Fargate service',
      allowAllOutbound: true,
    });

    // Fargate Service — use on-demand FARGATE for reliable initial deployment.
    // FARGATE_SPOT can be re-added once the service is stable.
    const service = new ecs.FargateService(this, 'BackendService', {
      serviceName: 'sutton5050-backend',
      cluster,
      taskDefinition: taskDef,
      desiredCount: 1,
      capacityProviderStrategies: [
        { capacityProvider: 'FARGATE', weight: 1, base: 1 },
      ],
      assignPublicIp: true,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      securityGroups: [serviceSg],
      healthCheckGracePeriod: cdk.Duration.seconds(120),
      circuitBreaker: { enable: true, rollback: true },
    });
    this.ecsService = service;

    // ALB in front of Fargate (internet-facing since VPC has public subnets only;
    // API Gateway + JWT authorizer is the security boundary, not the ALB)
    const alb = new elbv2.ApplicationLoadBalancer(this, 'BackendAlb', {
      vpc: props.vpc,
      internetFacing: true,
      loadBalancerName: 'sutton5050-backend-alb',
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
    });

    const listener = alb.addListener('HttpListener', {
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
    });

    listener.addTargets('BackendTarget', {
      port: 8000,
      targets: [service],
      healthCheck: {
        path: '/health',
        port: '8000',
        interval: cdk.Duration.seconds(15),
        timeout: cdk.Duration.seconds(10),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
      },
    });

    // Allow ALB to reach Fargate
    serviceSg.addIngressRule(
      ec2.Peer.securityGroupId(alb.connections.securityGroups[0].securityGroupId),
      ec2.Port.tcp(8000),
      'Allow ALB to backend',
    );

    // Regional ACM cert for API Gateway
    const apiCert = new acm.Certificate(this, 'ApiCert', {
      domainName: `api.${props.domainName}`,
      validation: acm.CertificateValidation.fromDns(props.hostedZone),
    });

    // HTTP API Gateway
    const httpApi = new apigwv2.CfnApi(this, 'HttpApi', {
      name: 'sutton5050-api',
      protocolType: 'HTTP',
      corsConfiguration: {
        allowHeaders: ['Authorization', 'Content-Type'],
        allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowOrigins: [`https://${props.domainName}`, 'http://localhost:5173'],
        maxAge: 3600,
      },
    });

    // Custom domain for API Gateway
    const apiDomainName = new apigwv2.CfnDomainName(this, 'ApiDomainName', {
      domainName: `api.${props.domainName}`,
      domainNameConfigurations: [
        {
          certificateArn: apiCert.certificateArn,
          endpointType: 'REGIONAL',
        },
      ],
    });

    // VPC Link for API GW → ALB
    const vpcLink = new apigwv2.CfnVpcLink(this, 'VpcLink', {
      name: 'sutton5050-vpc-link',
      subnetIds: props.vpc.publicSubnets.map(s => s.subnetId),
      securityGroupIds: [alb.connections.securityGroups[0].securityGroupId],
    });

    // JWT Authorizer using Cognito
    const authorizer = new apigwv2.CfnAuthorizer(this, 'CognitoAuthorizer', {
      apiId: httpApi.ref,
      name: 'cognito-jwt',
      authorizerType: 'JWT',
      identitySource: ['$request.header.Authorization'],
      jwtConfiguration: {
        issuer: `https://cognito-idp.${this.region}.amazonaws.com/${props.userPool.userPoolId}`,
        audience: [props.userPoolClient.userPoolClientId],
      },
    });

    // Integration — HTTP_PROXY to ALB via VPC Link
    const integration = new apigwv2.CfnIntegration(this, 'AlbIntegration', {
      apiId: httpApi.ref,
      integrationType: 'HTTP_PROXY',
      integrationUri: listener.listenerArn,
      integrationMethod: 'ANY',
      connectionType: 'VPC_LINK',
      connectionId: vpcLink.ref,
      payloadFormatVersion: '1.0',
    });

    // Default route with JWT authorizer
    new apigwv2.CfnRoute(this, 'DefaultRoute', {
      apiId: httpApi.ref,
      routeKey: '$default',
      target: `integrations/${integration.ref}`,
      authorizationType: 'JWT',
      authorizerId: authorizer.ref,
    });

    // Health check route without auth
    new apigwv2.CfnRoute(this, 'HealthRoute', {
      apiId: httpApi.ref,
      routeKey: 'GET /health',
      target: `integrations/${integration.ref}`,
      authorizationType: 'NONE',
    });

    // Stage
    new apigwv2.CfnStage(this, 'ApiStage', {
      apiId: httpApi.ref,
      stageName: '$default',
      autoDeploy: true,
    });

    // Map custom domain to API
    new apigwv2.CfnApiMapping(this, 'ApiMapping', {
      apiId: httpApi.ref,
      domainName: `api.${props.domainName}`,
      stage: '$default',
    }).addDependency(apiDomainName);

    // Route53 record for api.{domain}
    new route53.CnameRecord(this, 'ApiDnsRecord', {
      zone: props.hostedZone,
      recordName: `api.${props.domainName}`,
      domainName: apiDomainName.attrRegionalDomainName,
      ttl: cdk.Duration.minutes(5),
    });

    this.apiUrl = `https://api.${props.domainName}`;

    new cdk.CfnOutput(this, 'ApiUrl', { value: this.apiUrl });
    new cdk.CfnOutput(this, 'EcrRepoUri', { value: repo.repositoryUri });
    new cdk.CfnOutput(this, 'ClusterName', { value: cluster.clusterName });
    new cdk.CfnOutput(this, 'ServiceName', { value: service.serviceName });
  }
}
