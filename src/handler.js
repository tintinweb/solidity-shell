'use strict'
/**
 * @author github.com/tintinweb
 * @license MIT
 * */
/** IMPORT */
const Web3 = require('web3')
const solc = require('solc')

/** CONST */
const rexTypeError = /Return argument type (.*) is not implicitly convertible to expected type \(type of first return variable\)/;
const rexAssign = /[^=]=[^=]/;
const IGNORE_WARNINGS = [
    "Statement has no effect.",
    "Function state mutability can be restricted to ",
    "Unused local variable."
]

/** STATIC FUNC */

/** CLASS */
class SolidityStatement {

    constructor(rawCommand, scope) {
        this.rawCommand = rawCommand ? rawCommand.trim() : "true";
        this.hasNoReturnValue = (rexAssign.test(this.rawCommand)) || (this.rawCommand.startsWith('delete')) || (this.rawCommand.startsWith('assembly')) || (this.rawCommand.startsWith('revert'))

        if (scope) {
            this.scope = scope
        } else {
            if (this.rawCommand.startsWith('function ') || this.rawCommand.startsWith('modifier ')) {
                this.scope = "contract";
                this.hasNoReturnValue = true;
            } else if (this.rawCommand.startsWith('mapping ') || this.rawCommand.startsWith('event ')) {
                this.scope = "contract";
                this.hasNoReturnValue = true;
            } else if (this.rawCommand.startsWith('pragma ')) {
                this.scope = "sourceUnit";
                this.hasNoReturnValue = true;
            } else if (this.rawCommand.startsWith('struct ')) {
                this.scope = "sourceUnit";
                this.hasNoReturnValue = true;
            } else if (this.rawCommand.startsWith('contract ')) {
                this.scope = "sourceUnit";
                this.hasNoReturnValue = true;
            } else {
                this.scope = "main";
                this.rawCommand = this.fixStatement(this.rawCommand);
            }
        }

        //
        if (this.hasNoReturnValue) {
            // expression
            this.returnExpression = 'true;';
            this.returnType = 'bool';
        } else {
            // not an expression
            this.returnExpression = this.rawCommand;
            this.returnType = 'bool'
        }
    }

    fixStatement(stm) {
        return stm.endsWith(';') ? stm : `${stm};`
    }

    toString() {
        return this.rawCommand;
    }
}


class InteractiveSolidityShell {

    constructor(settings, log) {
        this.log = log || console.log;
        const defaults = {
            templateContractName: 'MainContract',
            templateFuncMain: 'main',
            installedSolidityVersion: require('../package.json').dependencies.solc.split("-", 1)[0],
            providerUrl: 'http://localhost:8545',
            autostartGanache: true,
            ganacheCmd: 'ganache-cli',
            debugShowContract: false
        }

        this.settings = {
            ...defaults, ... (settings || {})
        };

        this.reset()

        this.blockchain = new Blockchain(this.settings, this.log)
        this.blockchain.connect()
    }

    setSetting(key, value){
        this.settings[key] = value;
    }

    reset() {
        //console.log("---REVERT--")
        this.session = {
            statements: [],
        }
    }

    revert() {
        //console.log("---REVERT--")
        this.session.statements.pop();
    }

    prepareNextStatement(stm /* SolidityStatement */) {
        this.session.statements.push(stm);
    }

    template() {
        const prologue = this.session.statements.filter(stm => stm.scope === "sourceUnit");
        const contractState = this.session.statements.filter(stm => stm.scope === "contract");
        const mainStatements = this.session.statements.filter(stm => stm.scope === "main");

        var lastStatement = this.session.statements[this.session.statements.length -1];
        if(lastStatement.scope !== 'main'){
            /* not a main statement, put everything in the body and use a dummy as returnexpression */
            var mainBody = mainStatements; 
            lastStatement = new SolidityStatement() // add dummy w/o return value
        } else {
            var mainBody = mainStatements.slice(0, mainStatements.length - 1)
        }


        const ret = `
// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ${this.settings.installedSolidityVersion};

${prologue.join('\n\n')}

contract ${this.settings.templateContractName} {

    ${contractState.join('    \n\n')}

    function ${this.settings.templateFuncMain}() public returns (${lastStatement.returnType}) {
        ${mainBody.join('\n        ')}
        return ${lastStatement.returnExpression}
    }
}`.trim();
        if(this.settings.debugShowContract) this.log(ret)
        return ret;
    }

    async compile(source, cbWarning) {
        let input = {
            language: 'Solidity',
            sources: {
                '': {
                    content: source,
                },
            },
            settings: {
                outputSelection: {
                    '*': {
                        //
                    },
                },
            },
        }
        input.settings.outputSelection['*']['*'] = ['abi', 'evm.bytecode']

        let ret = JSON.parse(solc.compile(JSON.stringify(input)))
        if (ret.errors) {
            let realErrors = ret.errors.filter(err => err.type !== 'Warning');
            if (realErrors.length) {
                throw realErrors;
            }
            // print handle warnings
            let warnings = ret.errors.filter(err => err.type === 'Warning' && !IGNORE_WARNINGS.some(target => err.message.includes(target)));
            if(warnings.length) cbWarning(warnings);

        }
        return ret;
    }

    run(statement) {
        return new Promise((resolve, reject) => {
            this.prepareNextStatement(statement)


            // 1st. pass
            this.compile(this.template(), console.warn).then((res) => {
                // happy path; types are correct
                //console.log("first happy path")

                let contractData = res.contracts[''];
                contractData[this.settings.templateContractName]['main'] = this.settings.templateFuncMain;


                this.blockchain.deploy(contractData, (err, retval) => {
                    if (err) {
                        this.revert();
                        return reject(err)
                    }
                    return resolve(retval) // return value
                })
            }).catch(errors => {
                // frownie face
                //get last typeError to detect return type:
                let lastTypeError = errors.slice().reverse().find(err => err.type === "TypeError");
                if (!lastTypeError) {
                    this.revert();
                    return reject(errors);
                }

                let matches = lastTypeError.message.match(rexTypeError);
                if (!matches) {
                    console.error("BUG: cannot resolve type ://")
                    this.revert();
                    return reject(errors);
                }

                //console.log("2nd pass - detect return type")
                let retType = matches[1];
                if (retType.startsWith('int_const ')) {
                    retType = 'uint';
                } else if (retType.startsWith('contract ')) {
                    retType = retType.split("contract ", 2)[1]
                }
                this.session.statements[this.session.statements.length - 1].returnType = retType;

                //try again!
                this.compile(this.template(), console.warn).then((res) => {
                    // happy path
                    //console.log(res)

                    let contractData = res.contracts[''];
                    contractData[this.settings.templateContractName]['main'] = this.settings.templateFuncMain;

                    this.blockchain.deploy(contractData, (err, retval, c, d, e) => {
                        if (err) {
                            this.revert();
                            return reject(err)
                        }
                        return resolve(retval) // return value
                    })

                }).catch(errors => {
                    // error here
                    this.revert();
                    return reject(errors);
                })
            })
        });
    }
}

class Blockchain {
    constructor(settings, log) {
        this.log = log;
        this.settings = settings;

        this.provider = undefined
        this.web3 = undefined
        this.deployed = {}

        this.proc;
    }

    connect() {
        this.provider = new Web3.providers.HttpProvider(this.settings.providerUrl);
        this.web3 = new Web3(this.provider);

        this.web3.eth.net.isListening().then().catch(err => {
            if(!this.settings.autostartGanache){
                console.warn("⚠️  ganache autostart is disabled")
                return;
            }
            console.log("ℹ️  ganache-mgr: starting temp. ganache instance ...\n »")
            this.startService()
            this.provider = new Web3.providers.HttpProvider(this.settings.providerUrl);
            this.web3 = new Web3(this.provider);
        })

    }

    startService() {
        if (this.proc) {
            return this.proc;
        }
        this.proc = require('child_process').spawn(this.settings.ganacheCmd);
    }

    stopService() {
        this.log("💀  ganache-mgr: stopping temp. ganache instance")
        this.proc && this.proc.kill('SIGINT');
    }

    async getAccounts() {
        return this.web3.eth.getAccounts((err, result) => {
            if (err) throw new Error(err);
            return result;
        })
    }

    async deploy(contracts, callback) {
        //sort deploy other contracts first
        Object.entries(contracts).sort((a, b) => a[1].main ? 10 : -1).forEach(([templateContractName, o]) => {
            let thisContract = {
                bytecode: o.evm.bytecode.object,
                abi: o.abi,
                proxy: new this.web3.eth.Contract(o.abi, null),
                instance: undefined,
                main: o.main,
                accounts: undefined
            }
            this.deployed[templateContractName] = thisContract;
            this.getAccounts()
                .then(accounts => {
                    thisContract.accounts = accounts;
                    let instance = thisContract.proxy.deploy({ data: thisContract.bytecode }).send({ from: accounts[0], gas: 3e6 })
                    thisContract.instance = instance;
                    return instance;
                })
                .then(contract => {
                    if (thisContract.main) {
                        contract.methods[thisContract.main]().call({ from: thisContract.accounts[0], gas: 3e6 }, callback);
                    }
                    return;
                })
        }, this);
    }
}

module.exports = {
    InteractiveSolidityShell,
    SolidityStatement
}