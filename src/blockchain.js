'use strict'
/**
 * @author github.com/tintinweb
 * @license MIT
 * */
/** IMPORT */
const Web3 = require('web3');
const ganache = require("ganache");

class AbsBlockchainBase {
    constructor(shell, name) {
        this.log = shell.log;
        this.shell = shell

        this.provider = undefined
        this.web3 = undefined
        this.deployed = {}

        this.proc;
        this.name = name;
    }

    connect() {
        this.provider = new Web3.providers.HttpProvider(this.shell.settings.providerUrl);
        this.web3 = new Web3(this.provider);

        this.web3.eth.getAccounts().then().catch(err => {
            if (!this.shell.settings.autostartGanache) {
                console.warn("⚠️  ganache autostart is disabled")
                return;
            }
            this.startService()
            this.provider = new Web3.providers.HttpProvider(this.shell.settings.providerUrl);
            this.web3 = new Web3(this.provider);
        })
    }

    startService() {
        throw Error("Not Implemented");
    }

    stopService() {
        throw Error("Not Implemented");
    }

    restartService() {
        this.stopService();
        this.startService();
    }

    getAccounts() {
        return new Promise((resolve, reject) => {
            this.web3.eth.getAccounts((err, result) => {
                if (err) return reject(new Error(err));
                return resolve(result);
            })
        });
    }

    methodCall(cmd, args) {
        return new Promise((resolve, reject) => {
            let func = this.web3.eth[cmd];
            if (func === undefined) {
                return reject("  🧨 Unsupported Method");
            }
            if (typeof func === "function") {
                func((err, result) => {
                    if (err) return reject(new Error(err));
                    return resolve(result);
                });
            } else {
                return resolve(func);
            }
        });
    }

    rpcCall(method, params) {
        return new Promise((resolve, reject) => {
            let payload = {
                "jsonrpc": "2.0",
                "method": method,
                "params": params === undefined ? [] : params,
                "id": 1
            }
            this.provider.send(payload, (error, result) => {
                if (error)
                    return reject(error);
                return resolve(result);
            });
        });
    }

    getDeployed(){
        return this.deployed[this.shell.settings.templateContractName];
    }

    async deploy(contracts, callback) {
        //sort deploy other contracts first
        Object.entries(contracts).sort((a, b) => a[1].main ? 10 : -1).forEach(([templateContractName, o]) => {
            if (o.evm.bytecode.object.length === 0) {
                return; //no bytecode, probably an interface
            }

            let thisContract = {
                bytecode: o.evm.bytecode.object,
                opcodes: o.evm.bytecode.opcodes,
                abi: o.abi,
                proxy: new this.web3.eth.Contract(o.abi, null),
                instance: undefined,
                main: o.main,
                storageLayout: o.storageLayout,
                accounts: undefined
            }

            this.deployed[templateContractName] = thisContract;
            this.getAccounts()
                .then(accounts => {
                    thisContract.accounts = accounts;
                    let instance = thisContract.proxy.deploy({ data: thisContract.bytecode }).send({ from: accounts[0], gas: this.shell.settings.deployGas })
                    return instance;
                })
                .then(contract => {
                    thisContract.instance = contract;
                    if (thisContract.main) {
                        contract.methods[thisContract.main]().call({ from: thisContract.accounts[0], gas: this.shell.settings.callGas }, callback);
                    }
                    return;
                })
                .catch(err => {
                    callback(`💥  ganache not yet ready. Please try again. (👉 ${err} 👈)`)
                })

        }, this);
    }
}


class BuiltinGanacheBlockchain extends AbsBlockchainBase {

    constructor(shell) {
        super(shell, "Ganache built-in");

        /*
        const options = {    chain: ChainConfig,
            database: DatabaseConfig,
            logging: LoggingConfig,
            miner: MinerConfig,
            wallet: WalletConfig,
            fork: ForkConfig
        }
        */
        const defaultOptions = {
            logging: { quiet: true },
        };
        this.options = { ...defaultOptions, ...shell.settings.ganacheOptions };
    }

    connect() {
        this.startService();

        this.web3 = new Web3(this.provider);

        this.web3.eth.getAccounts().then().catch(err => {
            if (!this.shell.settings.autostartGanache) {
                console.warn("⚠️  ganache autostart is disabled")
                return;
            }
            this.startService()
            this.provider = new Web3.providers.HttpProvider(this.shell.settings.providerUrl);
            this.web3 = new Web3(this.provider);
        });


    }

    startService() {
        if (this.provider !== undefined) {
            return this.provider;
        }

        this.provider = ganache.provider(this.options);
    }
    stopService() {
        this.provider = undefined;
    }
}


class ExternalUrlBlockchain extends AbsBlockchainBase {

    constructor(shell, providerUrl) {
        super(shell, "Ganache url-provider");
        this.providerUrl = providerUrl;
    }

    connect() {
        this.provider = new Web3.providers.HttpProvider(this.providerUrl);
        this.web3 = new Web3(this.provider);

        this.web3.eth.getAccounts().then().catch(err => {
            if (!this.shell.settings.autostartGanache) {
                console.warn("⚠️  ganache autostart is disabled")
                return;
            }
            this.startService()
            this.provider = new Web3.providers.HttpProvider(this.providerUrl);
            this.web3 = new Web3(this.provider);
        })
    }

    startService() {
        // NOP
    }
    stopService() {
        // NOP
    }
}

class ExternalProcessBlockchain extends AbsBlockchainBase {

    constructor(shell) {
        super(shell, "Ganache ext-proc");
    }

    startService() {
        if (this.proc) {
            return this.proc;
        }
        this.log("ℹ️  ganache-mgr: starting temp. ganache instance ...\n »");

        this.proc = require('child_process').spawn(this.shell.settings.ganacheCmd, this.shell.settings.ganacheArgs);
        this.proc.on('error', function (err) {
            console.error(`
 🧨 Unable to launch blockchain serivce: ➜ ℹ️  ${err}

    Please verify that 'ganache-cli' (or similar service) is installed and available in your PATH.
    Otherwise, you can disable autostart by setting 'autostartGanache' to false in your settings or configure a different service and '.restartblockchain'.
            `);
        });
    }

    stopService() {
        this.log("💀  ganache-mgr: stopping temp. ganache instance");
        if (this.proc) {
            this.proc.kill('SIGINT');
            this.proc = undefined;
        }
    }
}



module.exports = {
    ExternalProcessBlockchain,
    ExternalUrlBlockchain,
    BuiltinGanacheBlockchain
}