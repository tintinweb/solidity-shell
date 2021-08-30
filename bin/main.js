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
const { convert, multilineInput } = require('../src/utils');

const CONFIG_HOME = path.join(os.homedir(), '.solidity-shell');
const CONFIG_FILE = '.config';

const REX_PLACEHOLDER = /(^|\s)(\$_)(\s|$)/ig /* LAST_KNOWN_RESULT placeholder */

var LAST_KNOWN_RESULT = 'ss';
var SESSION = 'previous.session';


/** static funcs */
function loadFile(name){
    let cfgFile = path.join(CONFIG_HOME, name);

    if(fs.existsSync(cfgFile)){
        return JSON.parse(fs.readFileSync(cfgFile));
    }
    return {};
}

function saveFile(name, data){
    let cfgFile = path.join(CONFIG_HOME, name);
    
    if(!fs.existsSync(CONFIG_HOME)){
        fs.mkdirSync(CONFIG_HOME);
    }
    fs.writeFileSync(cfgFile, JSON.stringify(data));
}

/** MAIN */

const shell = new InteractiveSolidityShell(loadFile(CONFIG_FILE));

const vorpal = new Vorpal()
    .delimiter('')
    .show()
    .parse(process.argv);

process.on('exit', () => { 
    shell.blockchain.stopService(); 
    saveFile(CONFIG_FILE, shell.settings)
    saveFile(SESSION, shell.dumpSession())
});


vorpal
    .mode('repl', 'Enters Solidity Shell Mode')
    .delimiter(c.bold('» '))
    .init(function (args, cb) {
        this.log(`🚀 Entering interactive Solidity shell. ${c.bold('.help')} and ${c.bold('.exit')} are your friends.`);
        this.log()
        return cb();
    })
    .action(function (input, cb) {
        let command = multilineInput(input);

        /* substitute placeholder: $_ */
        command = command.replace(REX_PLACEHOLDER, ' ' + LAST_KNOWN_RESULT + ' ');

        if (command.startsWith('.')) {
            let commandParts = command.split(' ');
            let ret = undefined;
            switch (commandParts[0]) {
                case '.help':
                    cb(`
📚 Help:
   -----

 ${c.bold('$_')} is a placeholder holding the most recent evaluation result.


 ${c.bold('General:')}
    .help                                ... this help :)
    .exit                                ... exit the shell

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

 ${c.bold('Debug:')}:
    .proc                                ... show processes managed by solidity-shell (ganache)
    .dump                                ... show template contract
    .echo                                ... every shell needs an echo command


cheers 🙌 
    ${c.bold('@tintinweb')} 
    ConsenSys Diligence @ https://consensys.net/diligence/
    https://github.com/tintinweb/solidity-shell/ 
`);

                    break; //show usage
                case '.exit': process.exit(); //exit -> no more cb()
                case '.reset': shell.reset(); break; //reset complete state
                case '.undo': shell.revert(); break; //revert last action
                case '.config':
                    switch(commandParts[1]){
                        case 'set': shell.setSetting(commandParts[2], convert(commandParts[3])); break;
                        case 'del': delete shell.settings[commandParts[2]]; break;
                        default: return cb(shell.settings); 
                    } break;
                case '.session': 
                    switch(commandParts[1]){
                        default:
                            let sessions = fs.readdirSync(CONFIG_HOME).filter(file => file.endsWith('.session'));
                            return cb('     - ' + sessions.map(s => c.bold(s.replace('.session',''))).join('\n     - '));
                        case 'load': 
                            shell.loadSession(loadFile(`${commandParts[2]}.session`))
                            break;
                        case 'save': 
                            SESSION = `${commandParts[2]}.session`;
                            saveFile(SESSION, shell.dumpSession())
                            break;
                    }; break;
                case '.dump': return cb(c.yellow(shell.template()));
                case '.echo': return cb(c.bold(c.yellow(commandParts.slice(1).join(' '))))
                case '.proc': 
                    if(!shell.blockchain.proc){
                        return cb();
                    }
                    return cb(`${c.bold(c.yellow(shell.blockchain.proc.pid))} - ${shell.blockchain.proc.spawnargs.join(', ')}`)

                default:
                    console.error(`Unknown Command: '${command}'. Type ${c.bold('.help')} for a list of commands.`);
            }
            // meta commands
            return cb(ret);
        }

        const statement = new SolidityStatement(command);

        /* REPL cmd */
        shell.run(statement).then(res => {
            if(typeof res === 'object'){
                return cb();
            }
            LAST_KNOWN_RESULT = res;
            cb(c.bold(c.yellow(res)));
        }).catch(errors => {
            console.error(errors)
            cb()
        })
    });


vorpal.execSync("repl")
