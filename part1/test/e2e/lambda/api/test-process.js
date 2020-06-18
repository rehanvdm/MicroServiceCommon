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
                                            Helper.API_CLIENT_URL);

        helper.SetAWSSDKCreds(Helper.AWS_PROFILE_MAME, Helper.AWS_PROFILE_REGION);
    });

    it('Person created', async function()
    {
        let result;

        let body = {
            "control": { },
            "data": {
                // "client_id": "XXX",
                "client_id": "f2710c82-4d7b-442d-91fd-cde5c8dd4c94",
                "name": "Rehan",
            }
        };

        let resourcePath = '/v1/process/person_created';

        console.log("Testing against:", Helper.TEST_AGAINST__DEPLOYED);
        if(helper.TestAgainst === Helper.TEST_AGAINST__DEVELOPMENT)
        {
            this.timeout(TimeOut*1000);

            let event = events.API_GATEWAY_HTTP_PROXY_POST(resourcePath,body, null, null,null);

            let app = helper.RequireLambdaFunction(resolve('../src/lambda/api/'), 'app.js');
            result = await app.handler(event, helper.LambdaContext(128, TimeOut));
        }
        else if(helper.TestAgainst === Helper.TEST_AGAINST__DEPLOYED) /* Do specific API Call against AWS Resources after deployment */
        {
            this.timeout(TimeOut*1000);

            result = await helper.API_Post(Helper.API_URL, resourcePath, body, null, null,);
        }

        expect(result).to.be.an('object');
        expect(result.statusCode).to.equal(200);
        expect(result.body).to.be.an('string');

        let response = JSON.parse(result.body);

        expect(response).to.be.an('object');
        expect(response.control.ResponseCode).to.be.equal(2000);

        expect(response.data).to.equal(true);
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

    it('Created common - name missing', async function()
    {
        let result;

        let body = {
            "control": { },
            "data": {
                "client_id": "XXX",
                // "name": "Rehan",
            }
        };

        let resourcePath = '/v1/process/person_created';

        console.log("Testing against:", Helper.TEST_AGAINST__DEPLOYED);
        if(helper.TestAgainst === Helper.TEST_AGAINST__DEVELOPMENT)
        {
            this.timeout(TimeOut*1000);

            let event = events.API_GATEWAY_HTTP_PROXY_POST(resourcePath,body, null, null,null);

            let app = helper.RequireLambdaFunction(resolve('../src/lambda/api/'), 'app.js');
            result = await app.handler(event, helper.LambdaContext(128, TimeOut));
        }
        else if(helper.TestAgainst === Helper.TEST_AGAINST__DEPLOYED) /* Do specific API Call against AWS Resources after deployment */
        {
            this.timeout(TimeOut*1000);

            result = await helper.API_Post(Helper.API_URL, resourcePath, body, null, null,);
        }

        expect(result).to.be.an('object');
        expect(result.statusCode).to.equal(200);
        expect(result.body).to.be.an('string');

        let response = JSON.parse(result.body);

        expect(response).to.be.an('object');
        expect(response.control.ResponseCode).to.be.equal(5002);
        expect(response.data).to.be.equal("Field: name is required and can not be longer than 50 characters");
    });

});

