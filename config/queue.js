const P = require("bluebird");
const mongoDbQueue = require("mongodb-queue");

let queue = null;

exports.initQueue = async (conn) => {
    queue = P.promisifyAll(mongoDbQueue(conn.connection, 'subQueue', {visibility: 0}))
    console.log("Init queue");
}

exports.getQueue = () => queue;
