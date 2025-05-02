import * as cdk from "aws-cdk-lib";
import * as lambdanode from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as custom from "aws-cdk-lib/custom-resources";
import { Construct } from "constructs";
import { generateBatch } from "../shared/util";
import { movieCrew } from "../seed/movies";
import * as apig from "aws-cdk-lib/aws-apigateway";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import * as events from "aws-cdk-lib/aws-lambda-event-sources";
import * as sns from "aws-cdk-lib/aws-sns";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as subs from "aws-cdk-lib/aws-sns-subscriptions";
import * as logs from "aws-cdk-lib/aws-logs";

export class ExamStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Question 1 - Serverless REST API

    // A table that stores data about a movie's crew, i.e. director, camera operators, etc.
    const table = new dynamodb.Table(this, "MoviesTable", {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: { name: "movieId", type: dynamodb.AttributeType.NUMBER },
      sortKey: { name: "role", type: dynamodb.AttributeType.STRING },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      tableName: "ExamTable",
    });

    const question1Fn = new lambdanode.NodejsFunction(this, "Question1Fn", {
      architecture: lambda.Architecture.ARM_64,
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: `${__dirname}/../lambdas/question1.ts`,
      timeout: cdk.Duration.seconds(10),
      memorySize: 128,
      environment: {
        TABLE_NAME: table.tableName,
        REGION: "eu-west-1",
      },
    });

    new custom.AwsCustomResource(this, "moviesddbInitData", {
      onCreate: {
        service: "DynamoDB",
        action: "batchWriteItem",
        parameters: {
          RequestItems: {
            [table.tableName]: generateBatch(movieCrew),
          },
        },
        physicalResourceId: custom.PhysicalResourceId.of("moviesddbInitData"), //.of(Date.now().toString()),
      },
      policy: custom.AwsCustomResourcePolicy.fromSdkCalls({
        resources: [table.tableArn],
      }),
    });

    const api = new apig.RestApi(this, "ExamAPI", {
      description: "Exam api",
      deployOptions: {
        stageName: "dev",
      },
      defaultCorsPreflightOptions: {
        allowHeaders: ["Content-Type", "X-Amz-Date"],
        allowMethods: ["OPTIONS", "GET", "POST", "PUT", "PATCH", "DELETE"],
        allowCredentials: true,
        allowOrigins: ["*"],
      },
    });

    const anEndpoint = api.root.addResource("patha");

    // Add new endpoint for crew by role and movie
    const crewEndpoint = api.root.addResource("crew");
    const roleEndpoint = crewEndpoint.addResource("{role}");
    const moviesEndpoint = roleEndpoint.addResource("movies");
    const movieIdEndpoint = moviesEndpoint.addResource("{movieId}");

    // Grant DynamoDB permissions to question1Fn
    table.grantReadData(question1Fn);
    
    // Add environment variables
    question1Fn.addEnvironment("TABLE_NAME", table.tableName);
    question1Fn.addEnvironment("REGION", this.region);

    // Add GET method with proper integration settings
    movieIdEndpoint.addMethod("GET", new apig.LambdaIntegration(question1Fn, {
      proxy: true,
      allowTestInvoke: true,
      timeout: cdk.Duration.seconds(10),
    }));

    // ==================================
    // Question 2 - Event-Driven architecture

    const topic1 = new sns.Topic(this, "Topic1", {
      displayName: "Exam topic",
    });
    
    // Create Queue B (Dead Letter Queue)
    const queueB = new sqs.Queue(this, "QueueB", {
      receiveMessageWaitTime: cdk.Duration.seconds(5),
      visibilityTimeout: cdk.Duration.seconds(30),
    });

    // Create Queue A with DLQ configuration
    const queueA = new sqs.Queue(this, "QueueA", {
      receiveMessageWaitTime: cdk.Duration.seconds(5),
      visibilityTimeout: cdk.Duration.seconds(30),
      deadLetterQueue: {
        queue: queueB,
        maxReceiveCount: 3,
      },
    });

    // Subscribe Queue A to Topic 1 with filter policy - 使用字符串匹配而不是嵌套属性匹配
    topic1.addSubscription(new subs.SqsSubscription(queueA, {
      filterPolicy: {
        'address.country': sns.SubscriptionFilter.stringFilter({
          allowlist: ["Ireland", "China"],
        }),
      },
      rawMessageDelivery: true,
    }));

    // Create Lambda X with explicit log retention
    const lambdaXFn = new lambdanode.NodejsFunction(this, "LambdaXFn", {
      architecture: lambda.Architecture.ARM_64,
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: `${__dirname}/../lambdas/lambdaX.ts`,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        REGION: "eu-west-1",
        TABLE_NAME: table.tableName,
        LOG_LEVEL: "DEBUG",
      },
      logRetention: logs.RetentionDays.ONE_WEEK,
      tracing: lambda.Tracing.ACTIVE, // 启用 X-Ray 跟踪
    });

    // Add SQS event source to Lambda X
    lambdaXFn.addEventSource(new events.SqsEventSource(queueA, {
      batchSize: 1,
      maxBatchingWindow: cdk.Duration.seconds(0),
      reportBatchItemFailures: true, // 启用部分批处理失败报告
    }));

    // Grant necessary permissions
    queueA.grantConsumeMessages(lambdaXFn);
    queueB.grantSendMessages(lambdaXFn);
    topic1.grantPublish(lambdaXFn);
    
    // Enable CloudWatch Logs access for Lambda function
    new logs.LogGroup(this, 'LambdaXLogGroup', {
      logGroupName: `/aws/lambda/${lambdaXFn.functionName}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      retention: logs.RetentionDays.ONE_WEEK,
    });

    // Add stack outputs
    new cdk.CfnOutput(this, 'TopicArn', {
      value: topic1.topicArn,
      description: 'The ARN of Topic1',
      exportName: 'Topic1Arn',
    });

    new cdk.CfnOutput(this, 'QueueAUrl', {
      value: queueA.queueUrl,
      description: 'The URL of Queue A',
      exportName: 'QueueAUrl',
    });

    new cdk.CfnOutput(this, 'QueueBUrl', {
      value: queueB.queueUrl,
      description: 'The URL of Queue B',
      exportName: 'QueueBUrl',
    });

    new cdk.CfnOutput(this, 'LambdaXFnName', {
      value: lambdaXFn.functionName,
      description: 'The name of Lambda X function',
      exportName: 'LambdaXFnName',
    });

    // Create Lambda Y
    const lambdaYFn = new lambdanode.NodejsFunction(this, "LambdaYFn", {
      architecture: lambda.Architecture.ARM_64,
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: `${__dirname}/../lambdas/lambdaY.ts`,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        REGION: "eu-west-1",
      },
      logRetention: logs.RetentionDays.ONE_WEEK,
      tracing: lambda.Tracing.ACTIVE,
    });

    // Add SQS event source to Lambda Y from Queue A
    lambdaYFn.addEventSource(new events.SqsEventSource(queueA, {
      batchSize: 1,
      maxBatchingWindow: cdk.Duration.seconds(0),
      reportBatchItemFailures: true,
    }));

    // Grant necessary permissions
    queueA.grantConsumeMessages(lambdaYFn);
    queueB.grantSendMessages(lambdaYFn);

    // Add Lambda Y name to stack outputs
    new cdk.CfnOutput(this, 'LambdaYFnName', {
      value: lambdaYFn.functionName,
      description: 'The name of Lambda Y function',
      exportName: 'LambdaYFnName',
    });
  }
}
  