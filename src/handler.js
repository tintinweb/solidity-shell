'use strict'
/**
 * @author github.com/tintinweb
 * @license MIT
 * */
/** IMPORT */
const path = require('path');
const Web3 = require('web3');
const solc = require('solc');
const { getRemoteCompiler } = require('./compiler/remoteCompiler.js');
const { readFileCallback } = require('./compiler/utils.js');
const { ExternalProcessBlockchain, ExternalUrlBlockchain ,BuiltinGanacheBlockchain } = require('./blockchain.js');


/** CONST */
const rexTypeErrorReturnArgumentX = /Return argument type (.*) is not implicitly convertible to expected type \(type of first return variable\)/;
const rexAssign = /[^=]=[^=];?/;
const rexTypeDecl = /^([\w\[\]]+\s(memory|storage)?\s*\w+);?$/;
const rexUnits = /^(\d+\s*(wei|gwei|szabo|finney|ether|seconds|minutes|hours|days|weeks|years))\s*;?$/;
const IGNORE_WARNINGS = [
    "Statement has no effect.",
    "Function state mutability can be restricted to ",
    "Unused local variable."
];
const TYPE_ERROR_DETECT_RETURNS = "Different number of arguments in return statement than in returns declaration."

const SCOPE = {
    CONTRACT: 1,  /* statement in contract scope */
    SOURCE_UNIT: 2, /* statement in source unit scope */
    MAIN: 4, /* statement in main function scope */
    VERSION_PRAGMA: 5 /* statement is a solidity version pragma */
}

/** STATIC FUNC */

function getBestSolidityVersion(source) {
    var rx = /^pragma solidity (\^?[^;]+);$/gm;
    let allVersions = source.match(rx).map(e => {
        try {
            return e.match(/(\d+)\.(\d+)\.(\d+)/).splice(1, 3).map(a => parseInt(a))
        } catch { }
    })
    let lastVersion = allVersions[allVersions.length - 1];
    if (!lastVersion) {
        return undefined;
    }
    return `^${lastVersion.join('.')}`;
}


/** CLASS */
class SolidityStatement {

    constructor(rawCommand, scope) {
        this.rawCommand = rawCommand ? rawCommand.trim() : "";
        this.hasNoReturnValue = (rexAssign.test(this.rawCommand))
            || (this.rawCommand.startsWith('delete '))
            || (this.rawCommand.startsWith('assembly'))
            || (this.rawCommand.startsWith('revert'))
            || (this.rawCommand.startsWith('unchecked '))
            || (this.rawCommand.startsWith('{'))
            || (rexTypeDecl.test(this.rawCommand) && !rexUnits.test(this.rawCommand))  /* looks like type decl but is not special builtin like "2 ether" */

        if (scope) {
            this.scope = scope;
        } else {
            if (['function ', 'modifier ', 'mapping ', 'event ', 'error '].some(e => this.rawCommand.startsWith(e))) {
                this.scope = SCOPE.CONTRACT;
                this.hasNoReturnValue = true;
            } else if (this.rawCommand.startsWith('pragma solidity ')) {
                this.scope = SCOPE.VERSION_PRAGMA;
                this.hasNoReturnValue = true;
                this.rawCommand = this.fixStatement(this.rawCommand);
            } else if (['pragma ', 'import '].some(e => this.rawCommand.startsWith(e))) {
                this.scope = SCOPE.SOURCE_UNIT;
                this.hasNoReturnValue = true;
                this.rawCommand = this.fixStatement(this.rawCommand);
            } else if (['contract ', 'interface ', 'struct '].some(e => this.rawCommand.startsWith(e))) {
                this.scope = SCOPE.SOURCE_UNIT;
                this.hasNoReturnValue = true;
            } else {
                this.scope = SCOPE.MAIN;
                this.rawCommand = this.fixStatement(this.rawCommand);
                if (this.rawCommand === ';') {
                    this.hasNoReturnValue = true;
                }
            }
        }


        if (this.hasNoReturnValue) {
            // expression
            this.returnExpression = ';';
            this.returnType = '';
        } else {
            // not an expression
            this.returnExpression = this.rawCommand;
            this.returnType = 'bool'
        }
    }

    fixStatement(stm) {
        return (stm.endsWith(';') || stm.endsWith('}')) ? stm : `${stm};`
    }

    toString() {
        return this.rawCommand;
    }

    toList() {
        return [this.rawCommand, this.scope]
    }
}


class InteractiveSolidityShell {

    constructor(settings, log) {
        this.log = log || console.log;

        const defaults = {
            templateContractName: 'MainContract',
            templateFuncMain: 'main',
            installedSolidityVersion: null, // overridden after merging settings; never use configured value
            providerUrl: 'http://127.0.0.1:8545',
            autostartGanache: true,
            blockchainProvider: 'internal',
            ganacheOptions: {},
            ganacheCmd: 'ganache-cli',
            ganacheArgs: [/*'--gasLimit=999000000'*/], //optionally increase default gas limit
            debugShowContract: false,
            resolveHttpImports: true,
            enableAutoComplete: true,
            callGas: 3e6,
            deployGas: 3e6
        }

        this.settings = {
            ...defaults, ... (settings || {})
        };

        this.settings.installedSolidityVersion = require('../package.json').dependencies.solc.split("-", 1)[0];

        this.cache = {
            compiler: {} /** compilerVersion:object */
        };

        this.cache.compiler[this.settings.installedSolidityVersion.startsWith("^") ? this.settings.installedSolidityVersion.substring(1) : this.settings.installedSolidityVersion] = solc;
        this.reset();

        this.initBlockchain();
    }

    initBlockchain() {
        if(this.blockchain){
            this.blockchain.stopService();
        }

        if(!this.settings.blockchainProvider || this.settings.blockchainProvider === "internal"){
            this.blockchain = new BuiltinGanacheBlockchain(this);
        } else if(this.settings.blockchainProvider.startsWith("https://") || this.settings.blockchainProvider.startsWith("http://")) {
            this.blockchain = new ExternalUrlBlockchain(this, this.settings.blockchainProvider);
        } else if (this.settings.blockchainProvider.length > 0) {
            this.settings.ganacheCmd = this.settings.blockchainProvider;
            this.blockchain = new ExternalProcessBlockchain(this);
        } else {
            this.log("  🧨 unknown blockchain provider. falling back to built-in ganache.")
            this.blockchain = new BuiltinGanacheBlockchain(this);
        }
        this.blockchain.connect();
    }

    loadSession(stmts) {
        if (!stmts) {
            this.session.statements = []
        } else {
            this.session.statements = stmts.map(s => new SolidityStatement(s[0], s[1]));
        }
    }

    dumpSession() {
        return this.session.statements.map(s => s.toList());
    }

    setSetting(key, value) {
        switch (key) {
            case 'installedSolidityVersion': return;
            case 'ganacheArgs':
                if (!value) {
                    value = [];
                }
                else if (!Array.isArray(value)) {
                    value = value.split(' ');
                }
                break;
            case 'ganacheCmd':
                value = value.trim();
        }
        this.settings[key] = value;
    }

    reset() {
        this.session = {
            statements: [],
        }
    }

    revert() {
        this.session.statements.pop();
    }

    prepareNextStatement(stm /* SolidityStatement */) {
        this.session.statements.push(stm);
    }

    template() {
        const prologue = this.session.statements.filter(stm => stm.scope === SCOPE.SOURCE_UNIT);
        const contractState = this.session.statements.filter(stm => stm.scope === SCOPE.CONTRACT);
        const mainStatements = this.session.statements.filter(stm => stm.scope === SCOPE.MAIN);

        /* figure out which compiler version to use */
        const lastVersionPragma = this.session.statements.filter(stm => stm.scope === SCOPE.VERSION_PRAGMA).pop();

        /* prepare body and return statement */
        var lastStatement = this.session.statements[this.session.statements.length - 1] || {}
        if (lastStatement.scope !== SCOPE.MAIN || lastStatement.hasNoReturnValue === true) {
            /* not a main statement, put everything in the body and use a dummy as returnexpression */
            var mainBody = mainStatements;
            lastStatement = new SolidityStatement() // add dummy w/o return value
        } else {
            var mainBody = mainStatements.slice(0, mainStatements.length - 1)
        }

        const ret = `
// SPDX-License-Identifier: GPL-2.0-or-later
${lastVersionPragma ? lastVersionPragma.rawCommand : `pragma solidity ${this.settings.installedSolidityVersion};`}

${prologue.join('\n\n')}

contract ${this.settings.templateContractName} {

    ${contractState.join('    \n\n')}

    function ${this.settings.templateFuncMain}() public ${lastStatement.returnType ? `returns (${lastStatement.returnType})` : ''} {
        ${mainBody.join('\n        ')}
        return ${lastStatement.returnExpression}
    }
}`.trim();
        if (this.settings.debugShowContract) this.log(ret)
        return ret;
    }


    loadCachedCompiler(solidityVersion) {

        solidityVersion = solidityVersion.startsWith("^") ? solidityVersion.substring(1) : solidityVersion; //strip leading ^
        var that = this;
        /** load remote version - (maybe cache?) */

        return new Promise((resolve, reject) => {
            if (that.cache.compiler[solidityVersion]) {
                return resolve(that.cache.compiler[solidityVersion]);
            }

            getRemoteCompiler(solidityVersion)
                .then(remoteSolidityVersion => {
                    solc.loadRemoteVersion(remoteSolidityVersion, function (err, solcSnapshot) {
                        that.cache.compiler[solidityVersion] = solcSnapshot;
                        return resolve(solcSnapshot)
                    })
                })
                .catch(err => {
                    return reject(err)
                })
        });

    }

    compile(source, cbWarning) {
        let solidityVersion = getBestSolidityVersion(source);
        return new Promise((resolve, reject) => {

            if (!solidityVersion) {
                return reject(new Error(`No valid solidity version found in source code (e.g. pragma solidity 0.8.10).`));
            }
            this.loadCachedCompiler(solidityVersion).then(solcSelected => {

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

                const callbacks = {
                    'import': (sourcePath) => readFileCallback(
                        sourcePath, {
                            basePath: process.cwd(), 
                            includePath: [
                                path.join(process.cwd(), "node_modules")
                            ],
                            allowHttp: this.settings.resolveHttpImports
                        }
                    )
                };

                let ret = JSON.parse(solcSelected.compile(JSON.stringify(input), callbacks))
                if (ret.errors) {
                    let realErrors = ret.errors.filter(err => err.type !== 'Warning');
                    if (realErrors.length) {
                        return reject(realErrors);
                    }
                    // print handle warnings
                    let warnings = ret.errors.filter(err => err.type === 'Warning' && !IGNORE_WARNINGS.some(target => err.message.includes(target)));
                    if (warnings.length) cbWarning(warnings);

                }
                return resolve(ret);
            })
                .catch(err => {
                    return reject(err);
                });
        });
    }

    run(statement) {
        return new Promise((resolve, reject) => {
            this.prepareNextStatement(statement)

            const sourceCode = this.template();
            // 1st. pass
            this.compile(sourceCode, console.warn).then((res) => {
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

                if (!Array.isArray(errors)) { //handle single error
                    this.revert();
                    return reject(errors);
                }
                //get last typeError to detect return type:
                let lastTypeError = errors.slice().reverse().find(err => err.type === "TypeError");
                if (!lastTypeError) {
                    this.revert();
                    return reject(errors);
                }
                let retType = ""
                let matches = lastTypeError.message.match(rexTypeErrorReturnArgumentX);
                if(matches){
                    //console.log("2nd pass - detect return type")
                    retType = matches[1];
                    if (retType.startsWith('int_const -')) {
                        retType = 'int';
                    } else if (retType.startsWith('int_const ')) {
                        retType = 'uint';
                    } else if (retType.startsWith('contract ')) {
                        retType = retType.split("contract ", 2)[1]
                    }
                } else if(lastTypeError.message.includes(TYPE_ERROR_DETECT_RETURNS)) {
                    console.error("WARNING: cannot auto-resolve type for complex function yet ://\n     If this is a function call, try unpacking the function return values into local variables explicitly!\n     e.g. `(uint a, address b, address c) = myContract.doSomething(1,2,3);`")
                    
                    // lets give it a low-effort try to resolve return types. this will not always work.
                    let rexFunctionName = new RegExp(`([a-zA-Z0-9_\\.]+)\\s*\\(.*?\\)`);
                    let matchedFunctionNames = statement.rawCommand.match(rexFunctionName);
                    if(matchedFunctionNames.length >= 1 ){
                        let funcNameParts = matchedFunctionNames[1].split(".");
                        let funcName = funcNameParts[funcNameParts.length-1]; //get last
                        let rexReturns = new RegExp(`function ${funcName}\\s*\\(.* returns\\s*\\(([^\\)]+)\\)`)
                        
                        let returnDecl = sourceCode.match(rexReturns);
                        if(returnDecl.length >1){
                            retType = returnDecl[1];
                        }
                    }

                    if(retType === ""){
                        this.revert();
                        return reject(errors);
                    }
                } else {
                    console.error("BUG: cannot resolve type ://")
                    this.revert();
                    return reject(errors);
                }
                
                this.session.statements[this.session.statements.length - 1].returnType = retType;

                //try again!
                this.compile(this.template(), console.warn).then((res) => {
                    // happy path
                    //console.log(res)

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
                    // error here
                    this.revert();
                    return reject(errors);
                })
            })
        });
    }
}

module.exports = {
    InteractiveSolidityShell,
    SolidityStatement,
    SCOPE
}