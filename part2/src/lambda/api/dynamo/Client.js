const client = require('../data_schema/client');
const BaseClass = require('./BaseClass');
const { v4: uuidv4 } = require('uuid');

class Client extends BaseClass
{
    constructor(dynamoClient, tableName)
    {
        super();

        this.TableName = tableName;
        this.DynamoClient = dynamoClient;
        this.PK = "clients";
    }

    /**
     *
     * @param _client
     * @returns {{SK: *, created_at: *, PK: *, client_id: *, person_count: *}}
     * @constructor
     */
    ToDynamoItem(_client)
    {
        let item = {
                    'PK' : this.GetDynamoValue(this.PK, "string"),
                    'SK' : this.GetDynamoValue(_client.client_id, "string"),
                    'name' : this.GetDynamoValue(_client.name, "string")
                };

        return item;
    }

    /**
     *
     * @param item
     * @returns {client}
     * @constructor
     */
    static FromDynamoItem(item)
    {
        return new client(
                            this.FromDynamoValue(item.SK),
                            this.FromDynamoValue(item.name)
                          );
    }

    /**
     *
     * @param {client} _client
     * @returns {Promise<{data: boolean}>}
     * @constructor
     */
    async Put(_client)
    {
        var params = {
            TableName: this.TableName,
            Item: this.ToDynamoItem(_client)
        };

        let resp = await this.DynamoClient.putItem(params).promise();
        return this.MethodReturn(true);
    };

    /**
     *
     * @param client_id
     * @param consistentRead
     * @returns {Promise<{data: *}>}
     * @constructor
     */
    async Find(client_id, consistentRead = false)
    {
        let params = {
            TableName: this.TableName,
            Key: {
                'PK' :this.GetDynamoValue(this.PK, "string"),
                'SK': this.GetDynamoValue(client_id)
            },
            ReturnConsumedCapacity: "TOTAL",
            ConsistentRead: consistentRead
        };

        let resp = (await this.DynamoClient.getItem(params).promise());
        let item = resp.Item ? Client.FromDynamoItem(resp.Item) : null;
        return this.MethodReturn(item);
    };

}


module.exports = Client;
