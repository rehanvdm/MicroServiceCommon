const moment = require('moment');
const { v4: uuidv4 } = require('uuid');

const LambdaError = require('../helpers/lambda_errors');
const LambdaLog = require('../helpers/lambda_log');
const logger = new LambdaLog();



const Client = require('../data_schema/client');
const DynamoClient = require('../dynamo/Client');

const ApiBaseClass = require('./ApiBaseClass');
class Common extends ApiBaseClass
{
    constructor(aws, awsXray)
    {
        super();

        this.snsClient = new aws.SNS({apiVersion: '2010-03-31'});

        this.dynamo = new aws.DynamoDB({apiVersion: '2012-08-10', maxRetries: 6, retryDelayOptions: { base: 50} });
        this.dynClient = new DynamoClient(this.dynamo, process.env.DYNAMO_TABLE);
    }

    async person_created(authUser, body)
    {
        if(!body.data.client_id)
            throw new LambdaError.ValidationError("Field: client_id is required");
        if(!body.data.name || body.data.name.length > 50)
            throw new LambdaError.ValidationError("Field: name is required and can not be longer than 50 characters");

        if(process.env.SKIP_NOTIFICATIONS === "false")
        {
            logger.log("SKIP_NOTIFICATIONS === false");

            /* Find client to enrich the notification */
            let respClient = await this.dynClient.Find(body.data.client_id);
            if(respClient.data === null)
                throw new LambdaError.HandledError("Client does not exist");

            let now = moment().utc().format("YYYY-MM-DD HH:mm");
            let params = {
                Message: '['+now+'] New person (' + body.data.name + ') added to ' + respClient.data.name,
                TopicArn: process.env.NOTIFICATIONS_TOPIC
            };
            let resp = await this.snsClient.publish(params).promise();
            logger.log("SNS Notification message submitted", resp.MessageId);
        }
        else
            logger.log("SKIP_NOTIFICATIONS === true");


        return this.MethodReturn(true);
    };

    async client_created(authUser, body)
    {
        if(!body.data.client_id)
            throw new LambdaError.ValidationError("Field: client_id is required");
        if(!body.data.name || body.data.name.length > 50)
            throw new LambdaError.ValidationError("Field: name is required and can not be longer than 50 characters");

        let client = new Client(body.data.client_id, body.data.name);
        await this.dynClient.Put(client);

        return this.MethodReturn(true);
    };
}

module.exports = Common;
