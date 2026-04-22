import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export interface StorageStackProps extends cdk.StackProps {
  domainName: string;
}

export class StorageStack extends cdk.Stack {
  public readonly table: dynamodb.ITable;
  public readonly storageBucket: s3.IBucket;
  public readonly ecrRepository: ecr.IRepository;

  constructor(scope: Construct, id: string, props: StorageStackProps) {
    super(scope, id, props);

    // Single-table design: pk/sk with GSI for flexible access patterns
    const table = new dynamodb.Table(this, 'AppTable', {
      tableName: 'sutton5050-app',
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'expiresAt',
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
    });

    // GSI for alternate access patterns
    table.addGlobalSecondaryIndex({
      indexName: 'gsi1',
      partitionKey: { name: 'gsi1pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'gsi1sk', type: dynamodb.AttributeType.STRING },
    });

    // App storage bucket
    const bucket = new s3.Bucket(this, 'StorageBucket', {
      bucketName: `sutton5050-storage-${cdk.Aws.ACCOUNT_ID}`,
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      cors: [
        {
          allowedHeaders: ['*'],
          allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.PUT, s3.HttpMethods.POST],
          allowedOrigins: [`https://${props.domainName}`, 'http://localhost:5173'],
          maxAge: 3600,
        },
      ],
    });

    // ECR Repository — lives here so we can push images before ECS exists
    const repo = new ecr.Repository(this, 'BackendRepo', {
      repositoryName: 'sutton5050-backend',
      imageScanOnPush: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      emptyOnDelete: true,
      lifecycleRules: [
        { maxImageCount: 5, description: 'Keep last 5 images' },
      ],
    });

    this.table = table;
    this.storageBucket = bucket;
    this.ecrRepository = repo;

    new cdk.CfnOutput(this, 'TableName', { value: table.tableName });
    new cdk.CfnOutput(this, 'StorageBucketName', { value: bucket.bucketName });
    new cdk.CfnOutput(this, 'EcrRepoUri', { value: repo.repositoryUri });
  }
}
