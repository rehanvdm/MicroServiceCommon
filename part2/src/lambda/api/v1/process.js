const moment = require('moment');
const { v4: uuidv4 } = require('uuid');

const LambdaError = require('../helpers/lambda_errors');
const LambdaLog = require('../helpers/lambda_log');
const logger = new LambdaLog();

const ClientAPI = require('../internal_apis/client-api-v1');

const ApiBaseClass = require('./ApiBaseClass');
class Common extends ApiBaseClass
{
    constructor(aws, awsXray)
    {
        super();

        this.snsClient = new aws.SNS({apiVersion: '2010-03-31'});
        this.clientAPI = new ClientAPI(awsXray, process.env.API_CLIENT_URL);
    }

    async person_created(authUser, body)
    {
        if(!body.data.client_id)
            throw new LambdaError.ValidationError("Field: client_id is required");
        if(!body.data.name || body.data.name.length > 50)
            throw new LambdaError.ValidationError("Field: name is required and can not be longer than 50 characters");

        let client = {};

        await this.clientAPI.increment_person_count(body.data.client_id);

        if(process.env.SKIP_NOTIFICATIONS === "false")
        {
            logger.log("SKIP_NOTIFICATIONS === false");

            /* Find client to enrich the notification */
            client = await this.clientAPI.client_find(body.data.client_id);
            if(client === null)
                throw new LambdaError.HandledError("Client does not exist");

            let now = moment().utc().format("YYYY-MM-DD HH:mm");
            let params = {
                Message: '['+now+'] New person (' + body.data.name + ') added to ' + client.name,
                TopicArn: process.env.NOTIFICATIONS_TOPIC
            };
            let resp = await this.snsClient.publish(params).promise();
            logger.log("SNS Notification message submitted", resp.MessageId);
        }
        else
            logger.log("SKIP_NOTIFICATIONS === true");


        return this.MethodReturn(true);
    };
}

module.exports = Common;
