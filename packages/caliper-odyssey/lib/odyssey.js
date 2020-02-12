/*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*
* http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/

'use strict';

const EthereumHDKey = require('ethereumjs-wallet/hdkey');
const Web3 = require('web3');
const {BlockchainInterface, CaliperUtils, TxStatus} = require('@hyperledger/caliper-core');
const logger = CaliperUtils.getLogger('odyssey.js');

/**
 * @typedef {Object} EthereumInvoke
 *
 * @property {string} verb Required. The name of the smart contract function
 * @property {string} args Required. Arguments of the smart contract function in the order in which they are defined
 * @property {boolean} isView Optional. If method to call is a view.
 */

/**
 * Implements {BlockchainInterface} for a web3 Odyssey backend.
 */
class Odyssey extends BlockchainInterface {

    /**
     * Create a new instance of the {Odyssey} class.
     * @param {string} config_path The path of the network configuration file.
     * @param {string} workspace_root The absolute path to the root location for the application configuration files.
     */
    constructor(config_path, workspace_root) {
        console.log("constructor-------------------");
        super(config_path);
        this.bcType = 'ethereum';
        this.workspaceRoot = workspace_root;
        this.ethereumConfig = require(config_path).ethereum;

        var web3Clients = [];
        if (typeof (this.ethereumConfig.url) == 'object') {
            this.ethereumConfig.url.forEach(function (myurl) {
                web3Clients.push(new Web3(myurl))
            })
        } else {
            web3Clients.push(new Web3(this.ethereumConfig.url))
        }
        // this.web3 = new Web3(this.ethereumConfig.url);
        console.log('sintan1071 dev --- web3Clients', web3Clients.length);
        this.web3 = web3Clients;
        this.web3.transactionConfirmationBlocks = this.ethereumConfig.transactionConfirmationBlocks;
    }

    /**
     * Initialize the {Odyssey} object.
     * @return {object} Promise<boolean> True if the account got unlocked successful otherwise false.
     */
    init() {
        console.log("init-------------------");

        if (this.ethereumConfig.contractDeployerAddressPrivateKey) {
            this.web3[0].eth.accounts.wallet.add(this.ethereumConfig.contractDeployerAddressPrivateKey);
        } else if (this.ethereumConfig.contractDeployerAddressPassword) {
            return this.web3[0].eth.personal.unlockAccount(this.ethereumConfig.contractDeployerAddress, this.ethereumConfig.contractDeployerAddressPassword, 1000);
        }
    }

    /**
     * Deploy smart contracts specified in the network configuration file.
     * @return {object} Promise execution for all the contract creations.
     */
    async installSmartContract() {
        console.log("installSmartContract-------------------");
        let promises = [];
        let self = this;
        logger.info('Creating contracts...');
        for (const key of Object.keys(this.ethereumConfig.contracts)) {
            let contractData = require(CaliperUtils.resolvePath(this.ethereumConfig.contracts[key].path, this.workspaceRoot)); // TODO remove path property
            let contractGas = this.ethereumConfig.contracts[key].gas;
            let estimateGas = this.ethereumConfig.contracts[key].estimateGas;
            this.ethereumConfig.contracts[key].abi = contractData.abi;
            promises.push(new Promise(async function (resolve, reject) {
                let contractInstance = await self.deployContract(contractData);
                logger.info('Deployed contract ' + contractData.name + ' at ' + contractInstance.options.address);
                self.ethereumConfig.contracts[key].address = contractInstance.options.address;
                self.ethereumConfig.contracts[key].gas = contractGas;
                self.ethereumConfig.contracts[key].estimateGas = estimateGas;
                resolve(contractInstance);
            }));
        }
        return Promise.all(promises);
    }

    /**
     * Return the Odyssey context associated with the given callback module name.
     * @param {string} name The name of the callback module as defined in the configuration files.
     * @param {object} args Unused.
     * @param {integer} clientIdx the client index
     * @return {object} The assembled Odyssey context.
     * @async
     */
    async getContext(name, args, clientIdx) {
        console.log("getContext-----clientIdx=", clientIdx);
        var ctrIdx = 0;

        ctrIdx = clientIdx % this.web3.length;

        let context = {
            clientIdx: clientIdx,
            contracts: {},
            nonces: {},
            web3: this.web3[ctrIdx]
        };

        for (const key of Object.keys(args.contracts)) {
            context.contracts[key] = {
                contract: new this.web3[ctrIdx].eth.Contract(args.contracts[key].abi, args.contracts[key].address),
                gas: args.contracts[key].gas,
                estimateGas: args.contracts[key].estimateGas
            };
        }

        // if (this.ethereumConfig.fromAddress) {
        //     context.fromAddress = this.ethereumConfig.fromAddress;
        // }
        // if (this.ethereumConfig.fromAddressSeed) {
        //     let hdwallet = EthereumHDKey.fromMasterSeed(this.ethereumConfig.fromAddressSeed);
        //     let wallet = hdwallet.derivePath('m/44\'/60\'/' + clientIdx + '\'/0/0').getWallet();
        //     context.fromAddress = wallet.getChecksumAddressString();
        //     context.nonces[context.fromAddress] = await this.web3[ctrIdx].eth.getTransactionCount(context.fromAddress);
        //     this.web3[ctrIdx].eth.accounts.wallet.add(wallet.getPrivateKeyString());
        // } else if (this.ethereumConfig.fromAddressPrivateKey) {
        //     context.nonces[this.ethereumConfig.fromAddress] = await this.web3[ctrIdx].eth.getTransactionCount(this.ethereumConfig.fromAddress);
        //     this.web3[ctrIdx].eth.accounts.wallet.add(this.ethereumConfig.fromAddressPrivateKey);
        // } else if (this.ethereumConfig.fromAddressPassword) {
        //     await context.web3.eth.personal.unlockAccount(this.ethereumConfig.fromAddress, this.ethereumConfig.fromAddressPassword, 1000);
        // }

        console.log("context:", context);
        return context;
    }

    /**
     * Release the given Odyssey context.
     * @param {object} context The Odyssey context to release.
     * @async
     */
    async releaseContext(context) {
        // nothing to do
    }

    /**
     * Invoke a smart contract.
     * @param {Object} context Context object.
     * @param {String} contractID Identity of the contract.
     * @param {String} contractVer Version of the contract.
     * @param {EthereumInvoke|EthereumInvoke[]} invokeData Smart contract methods calls.
     * @param {Number} timeout Request timeout, in seconds.
     * @return {Promise<object>} The promise for the result of the execution.
     */
    async invokeSmartContract(context, contractID, contractVer, invokeData, timeout) {
        let invocations;
        if (!Array.isArray(invokeData)) {
            invocations = [invokeData];
        } else {
            invocations = invokeData;
        }
        let promises = [];
        invocations.forEach((item, index) => {
            promises.push(this.sendTransaction(context, contractID, contractVer, item, timeout));
        });
        return Promise.all(promises);
    }

    /**
     * Query a smart contract.
     * @param {Object} context Context object.
     * @param {String} contractID Identity of the contract.
     * @param {String} contractVer Version of the contract.
     * @param {EthereumInvoke|EthereumInvoke[]} invokeData Smart contract methods calls.
     * @param {Number} timeout Request timeout, in seconds.
     * @return {Promise<object>} The promise for the result of the execution.
     */
    async querySmartContract(context, contractID, contractVer, invokeData, timeout) {
        let invocations;
        if (!Array.isArray(invokeData)) {
            invocations = [invokeData];
        } else {
            invocations = invokeData;
        }
        let promises = [];
        invocations.forEach((item, index) => {
            item.isView = true;
            promises.push(this.sendTransaction(context, contractID, contractVer, item, timeout));
        });
        return Promise.all(promises);
    }

    /**
     * Submit a transaction to the ethereum context.
     * @param {Object} context Context object.
     * @param {String} contractID Identity of the contract.
     * @param {String} contractVer Version of the contract.
     * @param {EthereumInvoke} methodCall Methods call data.
     * @param {Number} timeout Request timeout, in seconds.
     * @return {Promise<TxStatus>} Result and stats of the transaction invocation.
     */
    async sendTransaction(context, contractID, contractVer, methodCall, timeout) {
        let status = new TxStatus();
        let params = {from: context.fromAddress};
        let contractInfo = context.contracts[contractID];
        try {
            context.engine.submitCallback(1);
            let receipt = null;
            let methodType = 'send';
            if (methodCall.isView) {
                methodType = 'call';
            } else if (context.nonces && (typeof context.nonces[context.fromAddress] !== 'undefined')) {
                let nonce = context.nonces[context.fromAddress];
                context.nonces[context.fromAddress] = nonce + 1;
                params.nonce = nonce;
            }
            if (methodCall.args) {
                if (contractInfo.gas && contractInfo.gas[methodCall.verb]) {
                    params.gas = contractInfo.gas[methodCall.verb];
                } else if (contractInfo.estimateGas) {
                    params.gas = 1000 + await contractInfo.contract.methods[methodCall.verb](...methodCall.args).estimateGas();
                }
                receipt = await contractInfo.contract.methods[methodCall.verb](...methodCall.args)[methodType](params);
            } else {
                if (contractInfo.gas && contractInfo.gas[methodCall.verb]) {
                    params.gas = contractInfo.gas[methodCall.verb];
                } else if (contractInfo.estimateGas) {
                    params.gas = 1000 + await contractInfo.contract.methods[methodCall.verb].estimateGas(params);
                }
                receipt = await contractInfo.contract.methods[methodCall.verb]()[methodType](params);
            }
            status.SetID(receipt.transactionHash);
            status.SetResult(receipt);
            status.SetVerification(true);
            status.SetStatusSuccess();
        } catch (err) {
            status.SetStatusFail();
            logger.error('Failed tx on ' + contractID + ' calling method ' + methodCall.verb + ' nonce ' + params.nonce);
            logger.error(err);
        }
        return Promise.resolve(status);
    }

    /**
     * Query the given smart contract according to the specified options.
     * @param {object} context The Odyssey context returned by {getContext}.
     * @param {string} contractID The name of the contract.
     * @param {string} contractVer The version of the contract.
     * @param {string} key The argument to pass to the smart contract query.
     * @param {string} [fcn=query] The contract query function name.
     * @return {Promise<object>} The promise for the result of the execution.
     */
    async queryState(context, contractID, contractVer, key, fcn = 'query') {
        let methodCall = {
            verb: fcn,
            args: [key],
            isView: true
        };
        return this.sendTransaction(context, contractID, contractVer, methodCall, 60);
    }

    /**
     * Deploys a new contract using the given web3 instance
     * @param {JSON} contractData Contract data with abi, bytecode and gas properties
     * @returns {Promise<web3.eth.Contract>} The deployed contract instance
     */
    deployContract(contractData) {
        console.log("deployContract----------------------------")
        let web3 = this.web3[0];
        let contractDeployerAddress = this.ethereumConfig.contractDeployerAddress;
        return new Promise(function (resolve, reject) {
            let contract = new web3.eth.Contract(contractData.abi);
            let contractDeploy = contract.deploy({
                data: contractData.bytecode
            });
            contractDeploy.send({
                from: contractDeployerAddress,
                gas: contractData.gas
            }).on('error', (error) => {
                reject(error);
            }).then((newContractInstance) => {
                resolve(newContractInstance);
            });
        });
    }

    /**
     * It passes deployed contracts addresses to all clients
     * @param {Number} number of clients to prepare
     * @returns {Array} client args
     */
    async prepareClients(number) {
        let result = [];
        for (let i = 0; i < number; i++) {
            result[i] = {contracts: this.ethereumConfig.contracts};
        }
        return result;
    }

    async prepareAccounts() {
        let addresses = {};
        let isUsed = function (key) {
            if (addresses.hasOwnProperty(key)) {
                return true;
            } else {
                addresses[key] = true;
                return false;
            }
        }

        for (let i = 0; i < this.web3.length; i++) {
            let accounts = [];

            let accountsCount = this.calcWeb3ClientsAccountsCount(i);
            let accountsHas = await this.odysseyGetAccounts(this.web3[i]);

            for(let j = 0; j < accountsHas; j++) {
                const ele = accountsHas[j];
                console.log(ele + 'is used: ', isUsed(ele));
                if(!isUsed(ele)) {
                    let balance = await this.odysseyGetBalance(this.web3[i], ele);
                    if(balance <= 0) await this.odysseyTransfer(this.web3[i], this.ethereumConfig.contractDeployerAddress, ele, 1);
                    accounts.push(ele);
                }
            }

            let accountsNeed = accountsCount - accounts.length;

            for(let j = 0; j < accountsNeed; j++) {
                let newAddress = await this.odysseyCreatAccount(this.web3[i], this.ethereumConfig.contractDeployerAddressPassword | '1234');
                await this.odysseyTransfer(this.web3[i], this.ethereumConfig.contractDeployerAddress, newAddress, 1);
                accounts.push(newAddress);
            }
            this.web3[i].fromAddresses = accounts;
        }

    }

    /**
     * 用来计算发送交易客户端的账户数量
     * @param {Number} ClientIndex
     * @returns {Number} 账户数量
     */
    // calcWeb3ClientsAccountsCount(clientIdx) {
    calcWeb3ClientsAccountsCount(sequence) {
        // let sequence = clientIdx % this.web3.length;
        // let tag = Math.floor(clientIdx / this.web3.length);
        let round = Math.floor((this.ethereumConfig.clientsNumber - 1) / this.web3.length);
        let remainder = (this.ethereumConfig.clientsNumber - 1) % this.web3.length;
        let web3ClientsCount = round + (sequence <= remainder ? 1 : 0); // 连接到web3s数组下标为sequence的web3的clients的总数
        let web3ClientsAccountsCount = web3ClientsCount * this.ethereumConfig.accountsPerClient;
        return web3ClientsAccountsCount;
    }

    odysseyGetAccounts (iweb3) {
        // return new Promise(
        //     (resolve) => {
        //         iweb3.eth.getAccounts().then((ret) => {
        //             resolve(ret)
        //         })
        //     })
        return iweb3.eth.getAccounts();
    };

    odysseyGetBalance (iweb3, address) {
        // return new Promise(
        //     (resolve) => {
        //         iweb3.eth.getBalance(address).then((ret) => {
        //             resolve(ret)
        //         })
        //     })
        return iweb3.eth.getBalance(address);
    };

    odysseyTransfer(iweb3, from, to, amount){
        // return new Promise(
        //     (resolve) => {
        //         iweb3.eth.sendTransaction({
        //             from: from,
        //             to: to,
        //             value: amount
        //         }).then(function (receipt) {
        //             resolve(receipt);
        //         });
        //     })
        return iweb3.eth.sendTransaction({
                    from: from,
                    to: to,
                    value: amount
                });
    };

    odysseyCreatAccount(iweb3, pwd) {
        // return new Promise(
        //     (resolve) => {
        //         iweb3.eth.personal.newAccount(pwd, (e, ret) => {
        //             resolve(ret)
        //         })
        //     })
        return iweb3.eth.personal.newAccount(pwd);
    };

    odysseyUnlock (iweb3, address, pwd, duration = 1000)  {

        // return new Promise(
        //     (resolve) => {
        //         iweb3.eth.personal.unlockAccount(address, pwd, duration).then((ret) => {
        //             resolve(ret)
        //         })
        //     })
        return iweb3.eth.personal.unlockAccount(address, pwd, duration);
    };


}

module.exports = Odyssey;
