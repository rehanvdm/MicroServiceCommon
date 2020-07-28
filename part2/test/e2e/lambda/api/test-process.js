'use strict';
const chai = require('chai');
const expect = chai.expect;

var resolve = require('path').resolve;
const Helper = require('../../../_helpers/lambda_app.js');
const Events = require('../../../_events/events.js');
var events = new Events();
var helper = new Helper();

let TimeOut = 30;

// helper.TestAgainst = Helper.TEST_AGAINST__DEPLOYED;

describe('Test Process - Positive', function ()
{
    beforeEach(async function()
    {
        await helper.SetEnvironmentVariables("prod", "1.0.0", "1", "25",
                                            "false", "false", "false",
                                            // "true", "false", "5000", /* Only latency */
                                            // "true", "error", "false", /* Only hard error */
                                            // "true", "handled", "false", /* Only handled error */
                                            // "true", "error", "5000", /* Hard error after latency */
                                            Helper.NOTIFICATIONS_TOPIC, Helper.SKIP_NOTIFICATIONS,
                                            Helper.DYNAMO_TABLE);

        helper.SetAWSSDKCreds(Helper.AWS_PROFILE_MAME, Helper.AWS_PROFILE_REGION);
    });

    it('Person created', async function()
    {
        let result;

        let source = 'microservice.person.prod.v1';
        let detailType = 'person_created';
        let detail = {
                // "micro-service-trace-id": "f7585a36-956a-4552-8f0e-48f30937df47",
                "client_id": "f2710c82-4d7b-442d-91fd-cde5c8dd4c94",
                "name": "Rehan",
        };

        console.log("Testing against:", helper.TestAgainst);
        if(helper.TestAgainst === Helper.TEST_AGAINST__DEVELOPMENT)
        {
            this.timeout(TimeOut*1000);

            let event = events.EVENT_BRIDGE(source, detailType, detail);

            let app = helper.RequireLambdaFunction(resolve('../src/lambda/api/'), 'app.js');
            result = await app.handler(event, helper.LambdaContext(128, TimeOut));
        }
        else if(helper.TestAgainst === Helper.TEST_AGAINST__DEPLOYED) /* Do specific API Call against AWS Resources after deployment */
        {
            this.timeout(TimeOut*1000);

            result = await helper.API_Post(Helper.API_URL, resourcePath, body, null, null,);
        }

        expect(result).to.equal(true);
    });

    it('Client created', async function()
    {
        let result;

        let source = 'microservice.client.prod.v1';
        let detailType = 'client_created';
        let detail = {
            // "micro-service-trace-id": "4ebbd78d-977b-4149-95db-3dcacc5aed9f",
            "client_id": "4c6dbeb7-5bef-4385-aaef-486a0c187502xxx",
            "name": "AWESOME CLIENT"
        };

        console.log("Testing against:", helper.TestAgainst);
        if(helper.TestAgainst === Helper.TEST_AGAINST__DEVELOPMENT)
        {
            this.timeout(TimeOut*1000);

            let event = events.EVENT_BRIDGE(source, detailType, detail);

            let app = helper.RequireLambdaFunction(resolve('../src/lambda/api/'), 'app.js');
            result = await app.handler(event, helper.LambdaContext(128, TimeOut));
        }
        else if(helper.TestAgainst === Helper.TEST_AGAINST__DEPLOYED) /* Do specific API Call against AWS Resources after deployment */
        {
            this.timeout(TimeOut*1000);

            result = await helper.API_Post(Helper.API_URL, resourcePath, body, null, null,);
        }

        expect(result).to.equal(true);
    });

});


describe('Person created - Negative', function ()
{
    beforeEach(async function()
    {
        await helper.SetEnvironmentVariables("prod", "1.0.0", "1", "25",
            "false", "error", "5000");

        helper.SetAWSSDKCreds(Helper.AWS_PROFILE_MAME, Helper.AWS_PROFILE_REGION);
    });

    it('Person created - Poison pill', async function()
    {
        let result;

        let source = 'microservice.person.prod.v1';
        let detailType = 'person_created';
        let detail = {
            // // "micro-service-trace-id": "f7585a36-956a-4552-8f0e-48f30937df47",
            // "client_id": "f2710c82-4d7b-442d-91fd-cde5c8dd4c94",
            // "name": "Rehan",
        };

        console.log("Testing against:", helper.TestAgainst);
        if(helper.TestAgainst === Helper.TEST_AGAINST__DEVELOPMENT)
        {
            this.timeout(TimeOut*1000);

            let event = events.EVENT_BRIDGE(source, detailType, detail);

            let app = helper.RequireLambdaFunction(resolve('../src/lambda/api/'), 'app.js');
            result = await app.handler(event, helper.LambdaContext(128, TimeOut));
        }
        else if(helper.TestAgainst === Helper.TEST_AGAINST__DEPLOYED) /* Do specific API Call against AWS Resources after deployment */
        {
            this.timeout(TimeOut*1000);

            result = await helper.API_Post(Helper.API_URL, resourcePath, body, null, null,);
        }

        expect(result).to.equal(true);
    });

});

