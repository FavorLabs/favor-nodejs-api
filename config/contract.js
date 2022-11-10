const Web3 = require("web3-eth");
const jsonInterface = require("../config/FavorTube.json");
const tokenJsonInterface = require("../config/FavorToken.json");
const rpcURL = process.env.ENDPOINT;
const address = process.env.CONTRACT
const tokenAddress = process.env.TOKEN_CONTRACT

const eth = new Web3(rpcURL);
const contract = new eth.Contract(jsonInterface.abi, address);
const tokenContract = new eth.Contract(tokenJsonInterface.abi, tokenAddress);

module.exports = {
    eth,
    contract,
    tokenContract
}
