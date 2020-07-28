
class client
{
    constructor(client_id, name)
    {
        this.client_id = client_id;
        this.name = name;
    }

    static FromObject(obj)
    {
        return Object.assign(new client(), obj);
    }

    Sanitize()
    {
        let cpyThis = Object.assign({}, this);
        return cpyThis;
    }
}

module.exports = client;
