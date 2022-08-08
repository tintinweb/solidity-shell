#!/usr/bin/env node
'use strict'
/**
 * @author github.com/tintinweb
 * @license MIT
 * */
const Vorpal = require('vorpal');
const c = require('chalk');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { InteractiveSolidityShell, SolidityStatement } = require('../src/handler');
const { convert, multilineInput } = require('../src/cli/utils');
const { builtIns } = require('../src/compiler/autogenerated/builtIns');

/** GLobals */
const CONFIG_HOME = path.join(os.homedir(), '.solidity-shell');
const CONFIG_FILE = '.config';

const REX_PLACEHOLDER = /(\$_)/ig /* LAST_KNOWN_RESULT placeholder */

var LAST_KNOWN_RESULT = 'ss';
var SESSION = 'previous.session';


/** static funcs */
function loadFile(name) {
    let cfgFile = path.join(CONFIG_HOME, name);

    if (fs.existsSync(cfgFile)) {
        return JSON.parse(fs.readFileSync(cfgFile));
    }
    return {};
}

function saveFile(name, data) {
    let cfgFile = path.join(CONFIG_HOME, name);

    if (!fs.existsSync(CONFIG_HOME)) {
        fs.mkdirSync(CONFIG_HOME);
    }
    fs.writeFileSync(cfgFile, JSON.stringify(data));
}

/** MAIN */
const argv = require('minimist')(process.argv, { '--': true });
var config = loadFile(CONFIG_FILE);

const oldConf = {
    ganacheArgs: config.ganacheArgs,
    ganacheOptions: config.ganacheOptions
}

if (argv['--'].length) { // temporarily override ganache args
    config.ganacheArgs = argv['--'];
}
if (argv['fork']) {
    config.ganacheOptions.fork = { url: argv['fork'] }
}
if (argv['reset-config']) {
    config = {};
}
if (argv['show-config-file']) {
    console.log(path.join(CONFIG_HOME, CONFIG_FILE));
    process.exit(0);
}

const shell = new InteractiveSolidityShell(config);

process.on('exit', () => {
    shell.blockchain.stopService();
    if (argv['--'].length) { //restore old ganache args
        shell.settings.ganacheArgs = oldConf.ganacheArgs;
    }
    if (argv['fork']) {
        shell.settings.ganacheOptions.fork = oldConf.ganacheOptions.fork;
    }
    saveFile(SESSION, shell.dumpSession())

    // exit if dirty exit detected
    if (process.exitCode != 0) {
        console.log("🧨  not saving config due to dirty shutdown.")
        return;
    }
    saveFile(CONFIG_FILE, shell.settings)
});

const vorpal = new Vorpal()
    .delimiter('')
    .show()
    .parse(argv._);

vorpal.on('client_prompt_submit', (cmd) => {
    if (cmd.trim() === 'exit') {
        process.exit(0); // exit completely from repl. otherwise, would return to main vorpal loop
    }
});

function handleRepl(input, cb) {
    let command = multilineInput(input);

    /* substitute placeholder: $_ */
    command = command.replace(REX_PLACEHOLDER, ' (' + LAST_KNOWN_RESULT + ') ');

    if (command.startsWith('.')) {
        let commandParts = command.split(' ');
        let ret = undefined;
        switch (commandParts[0]) {
            case '.help':
                cb(`
📚 Help:
   -----

 ${c.bold('$_')} is a placeholder holding the most recent evaluation result.
 ${c.bold('pragma solidity <version>')} to change the compiler version.


 ${c.bold('General:')}
    .help                                ... this help :)
    .exit                                ... exit the shell

 ${c.bold('Source:')}
    .fetch 
            interface <address> <name> [chain=mainnet] ... fetch and load an interface declaration from an ABI spec on etherscan.io

 ${c.bold('Blockchain:')}
    .chain                         
            restart                      ... restart the blockchain service
            set-provider <fork-url>      ... "internal" | <shell-command: e.g. ganache-cli> | <https://localhost:8545>
                                            - fork url e.g. https://mainnet.infura.io/v3/yourApiKey  
            accounts                     ... return eth_getAccounts
            eth_<X> [...args]            ... initiate an arbitrary eth JSONrpc method call to blockchain provider.

 ${c.bold('Settings:')}
    .config                              ... show settings
            set <key> <value>            ... set setting
            unset <key>                  ... unset setting
 ${c.bold('Session:')}
    .session                             ... list sessions
            load <id>                    ... load session
            save <id>                    ... save session
    .undo                                ... undo last command
    .reset                               ... reset cmd history. start from scratch.

 ${c.bold('Debug:')}
    .proc                                ... show processes managed by solidity-shell (ganache)
    .dump                                ... show template contract
    .echo                                ... every shell needs an echo command


cheers 🙌 
    ${c.bold('@tintinweb')} 
    ConsenSys Diligence @ https://consensys.net/diligence/
    https://github.com/tintinweb/solidity-shell/ 
`);

                break; //show usage
            case '.exit': process.exit(); break; //exit -> no more cb()
            case '.chain':
                if (!commandParts[1]) {
                    break;
                }
                switch (commandParts[1]) {
                    case 'restart':
                        shell.blockchain.restartService();
                        this.log(`  ✨ '${shell.blockchain.name}' blockchain provider restarted.`)
                        break;
                    case 'set-provider':
                        shell.settings.blockchainProvider = commandParts[2];
                        if (commandParts.length > 3) {
                            //fork-url
                            shell.settings.ganacheOptions.fork = { url: commandParts[3] }
                        } else {
                            delete shell.settings.ganacheOptions.fork
                        }
                        shell.initBlockchain();
                        this.log(`  ✨ '${shell.blockchain.name}' initialized.`)
                        break;
                    case 'accounts':
                        shell.blockchain.getAccounts().then(acc => {
                            this.log(`\n   🧝‍ ${acc.join('\n   🧝 ')}\n`)

                        })
                        break;
                    default:
                        if (commandParts[1].startsWith("eth_")) {
                            shell.blockchain.rpcCall(commandParts[1], commandParts.slice(2)).then(res => this.log(res)).catch(e => this.log(e))
                        }

                        break;
                }

                break; //restart ganache
            case '.reset': shell.reset(); break; //reset complete state
            case '.undo': shell.revert(); break; //revert last action
            case '.config':
                switch (commandParts[1]) {
                    case 'set': shell.setSetting(commandParts[2], convert(commandParts.slice(3).join(' '))); break;
                    case 'unset': delete shell.settings[commandParts[2]]; break;
                    default: return cb(shell.settings);
                } break;
            case '.session':
                switch (commandParts[1]) {
                    default:
                        let sessions = fs.readdirSync(CONFIG_HOME).filter(file => file.endsWith('.session'));
                        return cb('     - ' + sessions.map(s => c.bold(s.replace('.session', ''))).join('\n     - '));
                    case 'load':
                        shell.loadSession(loadFile(`${commandParts[2]}.session`))
                        break;
                    case 'save':
                        SESSION = `${commandParts[2]}.session`;
                        saveFile(SESSION, shell.dumpSession())
                        break;
                };
                break;
            case '//DISABLED-.play':
                let path = `./${commandParts[1]}`
                if (!fs.existsSync(path)) {
                    this.log(`file not found: ${path}`);
                    return cb();
                }
                this.log(`⏯️  playing '${path}'`)
                let lines = fs.readFileSync(path, 'utf-8')
                lines.split('\n').map(l => l.trim()).filter(l => l && l.length).forEach(l => {
                    this.log(l)
                    this.parent.exec(l, function (err, data) {
                        if (!err && data) {
                            return cb(data)
                        }
                        return
                    })
                })
                break;
            case '.dump': return cb(c.yellow(shell.template()));
            case '.echo': return cb(c.bold(c.yellow(commandParts.slice(1).join(' '))))
            case '.proc':
                if (!shell.blockchain.proc) {
                    return cb();
                }
                return cb(`${c.bold(c.yellow(shell.blockchain.proc.pid))} - ${shell.blockchain.proc.spawnargs.join(', ')}`)
            case '.inspect':
                let deployed = shell.blockchain.getDeployed();
                switch (commandParts[1]) {
                    case 'storage': 
                        deployed && shell.blockchain.web3.eth.getStorageAt(deployed.instance.options.address, commandParts.length > 2 ? commandParts[2] : "0x0").then(console.log);
                        break;
                    case 'bytecode':
                        deployed && cb(c.yellow(deployed.bytecode));
                        break;
                    case 'deployed':
                        cb(deployed);
                        break;
                    case 'storageLayout':
                        deployed && cb(deployed.storageLayout);
                        break;
                    case 'opcodes':
                        deployed && cb(deployed.opcodes);
                        break;
                }
                break;
            case '.fetch':
                if (commandParts.length < 4) {
                    cb("Invalid params: .fetch interface <address> <name> [chain=mainnet] ... fetch and load an interface declaration from an ABI spec on etherscan.io")
                    break;
                }
                switch (commandParts[1]) {
                    case 'interface':
                        const { getRemoteInterfaceFromEtherscan } = require('../src/compiler/remoteCompiler');

                        getRemoteInterfaceFromEtherscan(
                            commandParts[2],
                            commandParts[3],
                            commandParts.length >= 4 ? commandParts[4] : undefined,
                            shell.settings.installedSolidityVersion
                        ).then(interfaceSource => {
                            console.log(interfaceSource);
                            return cb(handleRepl(interfaceSource, cb)); // recursively call
                        }).catch(e => {
                            console.error(e);
                            console.log("let's try once more 🤷‍♂️")
                            // try once more?
                            getRemoteInterfaceFromEtherscan(
                                commandParts[2],
                                commandParts[3],
                                commandParts.length >= 4 ? commandParts[4] : undefined,
                                shell.settings.installedSolidityVersion
                            ).then(interfaceSource => {
                                console.log(interfaceSource);
                                return cb(handleRepl(interfaceSource, cb)); // recursively call
                            }).catch(e => {
                                console.error(`Error trying to fetch remote interface: ${JSON.stringify(e)}`)
                            })
                        })
                        break;
                    default:
                        cb("Invalid params: .fetch interface <address> <name> [chain=mainnet] ... fetch and load an interface declaration from an ABI spec on etherscan.io")
                        break;
                }

                break;
            default:
                console.error(`Unknown Command: '${command}'. Type '${c.bold('.help')}' for a list of commands.`);
        }
        // meta commands
        return cb(ret);
    }

    const statement = new SolidityStatement(command);

    /* REPL cmd */
    shell.run(statement).then(res => {
        if (!Array.isArray(res) && typeof res === 'object') {
            if (Object.keys(res).length === 0) {
                // empty response, hide
                return cb();
            }
            res = JSON.stringify(res); //stringify the result
        }
        LAST_KNOWN_RESULT = res; // can only store last result for simple types
        cb(c.bold(c.yellow(res)));

    }).catch(errors => {
        console.error(errors)
        cb()
    })
}

vorpal
    .mode('repl', 'Enters Solidity Shell Mode')
    .delimiter(c.bold('» '))
    .init(function (args, cb) {
        this.log(`🚀 Entering interactive Solidity ${c.bold(shell.settings.installedSolidityVersion)} shell (🧁:${c.bold(shell.blockchain.name)}). '${c.bold('.help')}' and '${c.bold('.exit')}' are your friends.`);
        return cb();
    })
    .action(handleRepl);



/*** make autocomplete happy. this is hacky, i know 🙄 */

vorpal
    .command(".help")
vorpal
    .command(".exit")
    .alias("exit")
vorpal
    .command(".chain")
    .autocomplete(["restart", "set-provider", "accounts", "getAccounts"])
vorpal
    .command(".config")
    .autocomplete(["set", "unset"])

vorpal
    .command(".session")
    .autocomplete(["load", "save"])
vorpal
    .command(".undo")
vorpal
    .command(".redo")
vorpal
    .command(".reset")
vorpal
    .command(".proc")
vorpal
    .command(".dump")
vorpal
    .command(".fetch")
    .autocomplete(["interface"])
vorpal
    .command(".echo <msg>")
vorpal
    .command("$_")

/** autocomplate built-ins (not context sensitive) */
if (config.enableAutoComplete) {
    for (let builtin of builtIns) {
        vorpal  //register built-in as command (1st level autocomplete, with 2nd level autocomplete for params)
            .command(`${builtin}`)
            .autocomplete(builtIns);
    }
}

/** start in repl mode */
vorpal.execSync("repl")

//vorpal.execSync("uint a = 2") /* debug */