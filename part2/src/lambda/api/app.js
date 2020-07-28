const LambdaEvents = require('./helpers/lambda_events');
const LambdaResponse = require('./helpers/lambda_response');
const LambdaLog = require('./helpers/lambda_log');
const LambdaError = require('./helpers/lambda_errors');

const moment = require('moment');
const awsXray = require('aws-xray-sdk-core');
const aws =  awsXray.captureAWS(require('aws-sdk'));
/* Do not capture these, we will annotate them ourselves */
// awsXray.captureHTTPsGlobal(require('http'));
// awsXray.captureHTTPsGlobal(require('https'));
aws.config.region = 'us-east-1';

const audit_log = require('./data_schema/audit_log');

const logger = new LambdaLog();
logger.init(process.env.ENVIRONMENT);

function delay(ms) { return new Promise((resolve, reject) => setTimeout(resolve, ms)); }

exports.handler = async (event, context) =>
{
    let ret = false;
    logger.setTraceId(context.awsRequestId);
    logger.log("Init", process.env.ENVIRONMENT, process.env.VERSION, process.env.BUILD);

    if(process.env.ENABLE_CHAOS === "true" && process.env.INJECT_LATENCY !== "false")
    {
        logger.info("Injecting Latency", process.env.INJECT_LATENCY);
        await delay(process.env.INJECT_LATENCY);
    }

    if(process.env.ENABLE_CHAOS === "true" && process.env.INJECT_ERROR === "error")
        throw new Error("This is a simulated/injected HARD error");

    let response = null;
    let apiClass;

    let auditRecord = new audit_log(audit_log.GetNewID(), logger.getTraceId(), null,
        null, null, null, null,
        null, "api", "MicroServiceCommon::api", null,
        null, moment().utc().format("YYYY-MM-DD HH:mm:ss.SSS"), null,
        process.env.ENVIRONMENT, process.env.VERSION, process.env.BUILD);

    try
    {
        let request = LambdaEvents.EVENT_BRIDGE(event);

        /* If the API call comes from one of the other MicroService API calls, change this lambda log trace-d to match it */
        if(request.Detail["micro-service-trace-id"])
        {
            logger.log("Changing trace_id");
            logger.setTraceId(request.Detail["micro-service-trace-id"]);
            auditRecord.trace_id = request.Detail["micro-service-trace-id"];
        }

        if(process.env.ENABLE_CHAOS === "true" && process.env.INJECT_ERROR === "handled")
            throw new Error("This is a simulated/injected HANDLED error");

        // if( process.env.ENVIRONMENT === "prod") /* Log anonymized info */
        //     logger.log("Request", { HttpMethod: request.HttpMethod, Path: request.Path, Authorization: request.Authorization, QueryString: request.QueryString });
        // else
        logger.log("Request", request);

        let [,,,version] = request.Source.split('.', 4);
        let reqType = request.DetailType;
        let authUser = null;
        let body = { data : request.Detail }; /* Wrapping like this so that we don't have to change the business logic */

        auditRecord.origin = request.Source;
        auditRecord.origin_path = reqType;

        console.log(version,reqType);
        /* Create an instance of the class dynamically, ex: ./v1/link.js, since we whitelisted the functions
         * above so just assume that it is there and that we can execute it */
        apiClass = new (require('./'+version+'/process.js'))(aws, awsXray);
        let reqResp = await apiClass[reqType](authUser, body);

        auditRecord.status = true;
        auditRecord.status_code = 2001;
        response = true;

        /* IF the call wants to customize the values stored for audit log
           Explicitly assign fields to main_audit_record that got from response */
        if(reqResp.auditRecord)
        {
            if(reqResp.auditRecord.meta)
                auditRecord.meta = reqResp.meta;

            if(reqResp.auditRecord.client_id)
                auditRecord.client_id = reqResp.client_id;
        }
    }
    catch (err)
    {
        // console.error(err);
        logger.error(err);

        auditRecord.status = false;
        auditRecord.raise_alarm = true; /* Later do sampling */
        auditRecord.status_description = err.message;

        if(err instanceof LambdaError.HandledError)
            auditRecord.status_code = 5001;
        else if(err instanceof LambdaError.ValidationError)
            auditRecord.status_code = 5002;
        else if(err instanceof LambdaError.AuthError)
            auditRecord.status_code = 3001;
        else
            auditRecord.status_code = 5000;

        response = err;
    }
    finally
    {
        auditRecord.run_time = ((process.env.TIMEOUT*1000) -  context.getRemainingTimeInMillis());
        logger.audit(true, auditRecord);
    }

    if(response instanceof Error)
        throw response;

    return response;
}
