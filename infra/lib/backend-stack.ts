import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export interface BackendStackProps extends cdk.StackProps {
  domainName: string;
  vpc: ec2.IVpc;
  table: dynamodb.ITable;
  storageBucket: s3.IBucket;
  ecrRepository: ecr.IRepository;
  sandboxUsername: string;
  sandboxPassword: string;
}

// ECS Fargate + ALB. No API Gateway — CloudFront fronts the ALB directly
// (added in FrontendStack) so frontend and API share the same origin.
export class BackendStack extends cdk.Stack {
  public readonly ecsCluster: ecs.ICluster;
  public readonly ecsService: ecs.FargateService;
  public readonly alb: elbv2.IApplicationLoadBalancer;
  public readonly albDnsName: string;

  constructor(scope: Construct, id: string, props: BackendStackProps) {
    super(scope, id, props);

    const cluster = new ecs.Cluster(this, 'BackendCluster', {
      clusterName: 'sutton5050-cluster',
      vpc: props.vpc,
      enableFargateCapacityProviders: true,
    });
    this.ecsCluster = cluster;

    const taskDef = new ecs.FargateTaskDefinition(this, 'BackendTaskDef', {
      cpu: 256,
      memoryLimitMiB: 512,
    });

    props.table.grantReadWriteData(taskDef.taskRole);
    props.storageBucket.grantReadWrite(taskDef.taskRole);

    const container = taskDef.addContainer('backend', {
      image: ecs.ContainerImage.fromEcrRepository(props.ecrRepository, 'latest'),
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
        // Same-origin setup, so CORS only matters for local dev at localhost:5173.
        CORS_ORIGIN: 'http://localhost:5173',
        SANDBOX_USERNAME: props.sandboxUsername,
        SANDBOX_PASSWORD: props.sandboxPassword,
      },
    });
    container.addPortMappings({ containerPort: 8000 });

    const serviceSg = new ec2.SecurityGroup(this, 'ServiceSg', {
      vpc: props.vpc,
      description: 'Backend Fargate service',
      allowAllOutbound: true,
    });

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

    const alb = new elbv2.ApplicationLoadBalancer(this, 'BackendAlb', {
      vpc: props.vpc,
      internetFacing: true,
      loadBalancerName: 'sutton5050-backend-alb',
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
    });
    this.alb = alb;
    this.albDnsName = alb.loadBalancerDnsName;

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

    serviceSg.addIngressRule(
      ec2.Peer.securityGroupId(alb.connections.securityGroups[0].securityGroupId),
      ec2.Port.tcp(8000),
      'Allow ALB to backend',
    );

    new cdk.CfnOutput(this, 'AlbDnsName', { value: alb.loadBalancerDnsName });
    new cdk.CfnOutput(this, 'ClusterName', { value: cluster.clusterName });
    new cdk.CfnOutput(this, 'ServiceName', { value: service.serviceName });
  }
}
