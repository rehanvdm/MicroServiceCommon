import * as cdk from '@aws-cdk/core';
import * as lambda from '@aws-cdk/aws-lambda';
import * as dynamodb from '@aws-cdk/aws-dynamodb';
import * as apigateway from '@aws-cdk/aws-apigateway';

import logs = require('@aws-cdk/aws-logs');
import cloudwatch = require('@aws-cdk/aws-cloudwatch');
import sns = require('@aws-cdk/aws-sns');
import cloudwatchactions = require('@aws-cdk/aws-cloudwatch-actions');
import events = require('@aws-cdk/aws-events');
import events_targets = require('@aws-cdk/aws-events-targets');
import {EventBus} from "@aws-cdk/aws-events";
import * as sqs from '@aws-cdk/aws-sqs';

export class MicroServiceCommonStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps)
  {
    super(scope, id, props);

      let dynTable = new dynamodb.Table(this, id+"-table",
          {
              tableName: id+"-table",
              partitionKey: {
                  name: 'PK',
                  type: dynamodb.AttributeType.STRING
              },
              sortKey: {
                  name: 'SK',
                  type: dynamodb.AttributeType.STRING
              },
              billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
              removalPolicy: cdk.RemovalPolicy.DESTROY,
          });

    const notificationsTopic = new sns.Topic(this, id+"-notifications-topic", {
          topicName: id+"-notifications-topic",
          displayName: id+"-notifications-topic",
      });

    let environment = "prod";
    let lambdaTimeout = 25;
    let processDlq = new sqs.Queue(this, id+'-process-dlq');
    let apiLambda = new lambda.Function(this, id+"-lambda", {
                      functionName:  id+"-lambda",
                      code: new lambda.AssetCode('./src/lambda/api/'),
                      handler: 'app.handler',
                      runtime: lambda.Runtime.NODEJS_12_X,
                      timeout: cdk.Duration.seconds(lambdaTimeout),
                      environment: {
                        ENVIRONMENT: environment,
                        VERSION: "1.0.0",
                        BUILD: "1",
                        TIMEOUT: ""+lambdaTimeout,

                        ENABLE_CHAOS: "false",
                        INJECT_ERROR: "true",
                        INJECT_LATENCY: "5000",

                        NOTIFICATIONS_TOPIC: notificationsTopic.topicArn,
                        SKIP_NOTIFICATIONS: "false", /* Helpful flag during testing */
                        DYNAMO_TABLE: dynTable.tableName
                      },
                      tracing: lambda.Tracing.ACTIVE,
                      deadLetterQueue: processDlq,
                      deadLetterQueueEnabled: true
                    });
    notificationsTopic.grantPublish(apiLambda);
    dynTable.grantReadWriteData(apiLambda);


    const personRule = new events.Rule(this, id+"-all-person-client-rule", {
      description: 'All events from the person service',
      // eventBus: No need to specify if using the default
      eventPattern: {
          /* https://github.com/aws/aws-cdk/issues/6184 */
          source: [{ prefix: "microservice.person.prod" }, { prefix: "microservice.client.prod" }] as any[],
      }
    });
    personRule.addTarget(new events_targets.LambdaFunction(apiLambda));


      new cdk.CfnOutput(this, 'DYNAMO_TABLE', { value: dynTable.tableName });
      new cdk.CfnOutput(this, 'NOTIFICATIONS_TOPIC', { value: notificationsTopic.topicArn });
    /* ==========================================================================================================
       =================================== Logging, Alarms & Dashboard ==========================================
       ========================================================================================================== */

    const alarmTopic = new sns.Topic(this, id+"alarm-topic", {
      topicName: id+"alarm-topic",
      displayName: id+"alarm-topic",
    });
    const cwAlarmAction = new cloudwatchactions.SnsAction(alarmTopic);


    function MetricToAlarmName(metric: cloudwatch.Metric)
    {
      let dim1Val = null;
      if(metric.toAlarmConfig().dimensions)
      {
          let dimensions = metric.toAlarmConfig().dimensions ? metric.toAlarmConfig().dimensions as cloudwatch.Dimension[] : [];
          if(dimensions.length > 0)
              dim1Val = dimensions[0].value;
      }

      return id + "::" + [metric.namespace, metric.metricName, dim1Val].join('/');
    }
    function SoftErrorLambdaMetricFilterAlarm(scope: cdk.Construct, metricName: string, filterPattern: logs.IFilterPattern,
                                            lambdaFunction: lambda.Function, cwAlarmAction: cloudwatch.IAlarmAction)
    {
      const METRIC_NAMESPACE = 'LogMetrics/Lambda';

      let safeConstructId = lambdaFunction.node.id + "-" + metricName.replace(/\//gm, '-');


      /* LogMetricFilters do not take into account Dimension, so creating a namespace with metricname */
      const metric = new cloudwatch.Metric({
          namespace: METRIC_NAMESPACE + "/" + metricName,
          metricName: lambdaFunction.node.id,
      });
      //@ts-ignore
      let filter = new logs.MetricFilter(scope, safeConstructId+'Filter', {
          metricName: metric.metricName,
          metricNamespace: metric.namespace,
          logGroup: lambdaFunction.logGroup,
          filterPattern: filterPattern,
          metricValue: "1"
      });
      let alarm = new cloudwatch.Alarm(scope, safeConstructId+'Alarm', {
          metric: metric,
          actionsEnabled: true,
          alarmName: MetricToAlarmName(metric),
          comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
          threshold: 1,
          period: cdk.Duration.minutes(1),
          evaluationPeriods: 1,
          statistic: "Sum",
          treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
      });
      alarm.addAlarmAction(cwAlarmAction);
      alarm.addOkAction(cwAlarmAction);

      return alarm; //[metric, filter, alarm]
    }

    let apiLambdaAlarm_HandledError = SoftErrorLambdaMetricFilterAlarm(this, 'Errors/HandledError',
                                      logs.FilterPattern.all(
                                          logs.FilterPattern.stringValue("$.level", "=", "audit"),
                                          logs.FilterPattern.booleanValue("$.args.status",  false),
                                          logs.FilterPattern.booleanValue("$.args.raise_alarm",  true),
                                          logs.FilterPattern.stringValue("$.args.status_code", "=", "5001")),
                                      apiLambda, cwAlarmAction);
    let apiLambdaAlarm_ValidationError = SoftErrorLambdaMetricFilterAlarm(this, 'Errors/ValidationError',
                                          logs.FilterPattern.all(
                                              logs.FilterPattern.stringValue("$.level", "=", "audit"),
                                              logs.FilterPattern.booleanValue("$.args.status",  false),
                                              logs.FilterPattern.booleanValue("$.args.raise_alarm",  true),
                                              logs.FilterPattern.stringValue("$.args.status_code", "=", "5002")),
                                          apiLambda, cwAlarmAction);
    let  apiLambdaAlarm_AuthError = SoftErrorLambdaMetricFilterAlarm(this, 'Errors/AuthError',
                                      logs.FilterPattern.all(
                                          logs.FilterPattern.stringValue("$.level", "=", "audit"),
                                          logs.FilterPattern.booleanValue("$.args.status",  false),
                                          logs.FilterPattern.booleanValue("$.args.raise_alarm",  true),
                                          logs.FilterPattern.stringValue("$.args.status_code", "=", "3001")),
                                      apiLambda, cwAlarmAction);
    let  apiLambdaAlarm_UnexpectedError = SoftErrorLambdaMetricFilterAlarm(this, 'Errors/UnexpectedError',
                                              logs.FilterPattern.all(
                                                  logs.FilterPattern.stringValue("$.level", "=", "audit"),
                                                  logs.FilterPattern.booleanValue("$.args.status",  false),
                                                  logs.FilterPattern.booleanValue("$.args.raise_alarm",  true),
                                                  logs.FilterPattern.stringValue("$.args.status_code", "=", "5000")),
                                              apiLambda, cwAlarmAction);


    let apiLambdaAlarmHardError = new cloudwatch.Alarm(this, id+"ApiHardErrorAlarm", {
      metric: apiLambda.metricErrors(),
      actionsEnabled: true,
      alarmName: MetricToAlarmName(apiLambda.metricErrors()),
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      threshold: 1,
      period: cdk.Duration.minutes(1),
      evaluationPeriods: 1,
      statistic: "Sum",
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });
    apiLambdaAlarmHardError.addAlarmAction(cwAlarmAction);
    apiLambdaAlarmHardError.addOkAction(cwAlarmAction);

    // let apiMetricCount =  new cloudwatch.Metric({
    //   namespace: "AWS/ApiGateway",
    //   metricName:'Count',
    //   dimensions: { ApiName: apiName }
    // });
    // let apiAlarmHighUsage = new cloudwatch.Alarm(this,id+"ApiGatewayHeavyUsage", {
    //   metric: apiMetricCount,
    //   actionsEnabled: true,
    //   alarmName: MetricToAlarmName(apiMetricCount),
    //   comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    //   threshold: 100,
    //   period: cdk.Duration.minutes(1),
    //   evaluationPeriods: 3,
    //   statistic: "Sum",
    //   treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    // });
    // apiAlarmHighUsage.addAlarmAction(cwAlarmAction);
    // apiAlarmHighUsage.addOkAction(cwAlarmAction);






    let dashboard = new cloudwatch.Dashboard(this, id+'-dashboard', {
      dashboardName: id,
      start: "-PT24H",
      periodOverride: cloudwatch.PeriodOverride.AUTO
    });

    dashboard.addWidgets(new cloudwatch.TextWidget({
      markdown: '# Lambda Metrics',
      width: 24
    }));
    dashboard.addWidgets(
      new cloudwatch.Row(
          new cloudwatch.GraphWidget({
              title: "Lambda Hard Errors", left: [
                  new cloudwatch.Metric({
                      label: 'api',
                      namespace: "AWS/Lambda",
                      metricName:'Errors',
                      dimensions: { FunctionName: apiLambda.functionName },
                      statistic: "Sum",
                  }),
              ]}),
          new cloudwatch.GraphWidget({
              title: "Lambda Invocations",
              left: [
                  new cloudwatch.Metric({
                      label: 'api - Invocations',
                      namespace: "AWS/Lambda",
                      metricName:'Invocations',
                      dimensions: { FunctionName: apiLambda.functionName },
                      statistic: "Sum",
                  }),
                  new cloudwatch.Metric({
                      label: 'api - ConcurrentExecutions',
                      namespace: "AWS/Lambda",
                      metricName:'ConcurrentExecutions',
                      dimensions: { FunctionName: apiLambda.functionName },
                      statistic: "Maximum",
                  }),
              ],
          }),
          new cloudwatch.GraphWidget({
              title: "Lambda Duration",
              left: [
                  new cloudwatch.Metric({
                      label: "api - p95",
                      namespace: "AWS/Lambda",
                      metricName:'Duration',
                      dimensions: { FunctionName: apiLambda.functionName },
                      statistic: "p95"
                  }),
                  new cloudwatch.Metric({
                      label: "api - avg",
                      namespace: "AWS/Lambda",
                      metricName:'Duration',
                      dimensions: { FunctionName: apiLambda.functionName },
                      statistic: "Average"
                  }),
                  new cloudwatch.Metric({
                      label: "api - max",
                      namespace: "AWS/Lambda",
                      metricName:'Duration',
                      dimensions: { FunctionName: apiLambda.functionName },
                      statistic: "Maximum"
                  }),
              ],
          }),
          new cloudwatch.GraphWidget({
              title: "API Lambda Soft Errors",
              left: [
                  apiLambdaAlarm_HandledError.metric,
                  apiLambdaAlarm_ValidationError.metric,
                  apiLambdaAlarm_AuthError.metric,
                  apiLambdaAlarm_UnexpectedError.metric,
              ],
          }),
      )
    );


      dashboard.addWidgets(new cloudwatch.TextWidget({
          markdown: '# Dynamo & SQS',
          width: 24
      }));
      dashboard.addWidgets(
          new cloudwatch.Row(
              new cloudwatch.GraphWidget({
                  title: "Dynamo Capacity",
                  left: [
                      new cloudwatch.Metric({
                          label: "RCU",
                          namespace: "AWS/DynamoDB",
                          metricName:'ConsumedReadCapacityUnits',
                          dimensions: { TableName: dynTable.tableName },
                          statistic: "Sum",
                      }),
                      new cloudwatch.Metric({
                          label: "WCU",
                          namespace: "AWS/DynamoDB",
                          metricName:'ConsumedWriteCapacityUnits',
                          dimensions: { TableName: dynTable.tableName },
                          statistic: "Sum",
                      }),
                  ],
              }),
              new cloudwatch.GraphWidget({
                  title: "DLQ Messages",
                  left: [
                      new cloudwatch.Metric({
                          label: 'Visible',
                          namespace: "AWS/SQS",
                          metricName:'ApproximateNumberOfMessagesVisible',
                          dimensions: { QueueName: processDlq.queueName },
                          statistic: "Sum",
                      }),
                      new cloudwatch.Metric({
                          label: 'NOT Visible',
                          namespace: "AWS/SQS",
                          metricName:'ApproximateNumberOfMessagesNotVisible',
                          dimensions: { QueueName: processDlq.queueName },
                          statistic: "Sum",
                      }),
                  ],
              }),
          )
      );

  }
}
