const axios = require('axios');
const Xray = require('../helpers/xray');
const LambdaLog = require('../helpers/lambda_log');
const logger = new LambdaLog();

class ClientApiV1
{
    constructor(awsXray, apiUrl)
    {
        this.awsXray = awsXray;
        this.xray = new Xray(awsXray);
        this.apiUrl = apiUrl;
        this.version = "/v1";

        this.xraySegmentName = "API::MicroServiceClient/prod"+this.version
    }

    async apiRequest(method, resourcePath, body, queryParams = null,  headers = {}, timeout = 20000)
    {
        var options = {
            method: method,
            data: body,
            params: queryParams,
            url:  this.apiUrl+resourcePath,
            timeout: timeout,
            headers: Object.assign(headers, {
                "micro-service-trace-id":  logger.getTraceId()
            }),
            transformResponse: (res) => { return res; } /* Do not parse json */
        };

        let resp = await axios(options); /* Let this error, aka anything non 200 will throw error, bubble up */
        return resp.data;
    }

    // async client_find(clientId)
    // {
    //     let body = {
    //         control: {},
    //         data: {
    //             client_id: clientId
    //         },
    //     };
    //
    //     // let resp = await this.apiRequest("POST", this.version+"/client/find", body);
    //     let resp = await this.xray.AsyncSegment(this.xraySegmentName,"client/find", //this.version+"/client/find"
    //                                     this.apiRequest("POST", this.version+"/client/find", body),
    //                         {"client_id": clientId});
    //
    //     let retBody = JSON.parse(resp);
    //     if(retBody.control.ResponseCode !== 2000)
    //         throw new Error("ClientApiV1.client_find :: "+resp);
    //
    //     return retBody.data;
    // }

    async client_find(clientId)
    {
        let body = {
            control: {},
            data: {
                client_id: clientId
            },
        };

        return await this.xray.AsyncSegment(this.xraySegmentName,"client/find",
                        this.apiRequest("POST", this.version+"/client/find", body)
                            .then(resp =>
                            {
                                let retBody = JSON.parse(resp);
                                if(retBody.control.ResponseCode !== 2000)
                                    throw new Error("ClientApiV1.client_find :: "+resp);

                                return retBody.data;
                            })
                        ,{"client_id": clientId});
    }

    // async increment_person_count(clientId)
    // {
    //     let body = {
    //         control: {},
    //         data: {
    //             client_id: clientId
    //         },
    //     };
    //
    //     let resp = await this.xray.AsyncSegment(this.xraySegmentName,"increment_person_count",
    //                                     this.apiRequest("POST", this.version+"/client/increment_person_count", body),
    //                                     {"client_id": clientId});
    //
    //     let retBody = JSON.parse(resp);
    //     if(retBody.control.ResponseCode !== 2000)
    //         throw new Error("ClientApiV1.increment_person_count :: "+resp);
    //
    //     return retBody.data;
    // }

    async increment_person_count(clientId)
    {
        let body = {
            control: {},
            data: {
                client_id: clientId
            },
        };

        return await this.xray.AsyncSegment(this.xraySegmentName,"client/increment_person_count",
                      this.apiRequest("POST", this.version+"/client/increment_person_count", body)
                                    .then(resp =>
                                    {
                                        let retBody = JSON.parse(resp);
                                        if(retBody.control.ResponseCode !== 2000)
                                            throw new Error("ClientApiV1.increment_person_count :: "+resp);

                                        return retBody.data;
                                    })
                        ,{"client_id": clientId});
    }

}

module.exports = ClientApiV1;
