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
const CONFIG_FILE = path.join(CONFIG_HOME, '.config');

/** static funcs */
function tryLoadSettings(){
    let settings = {};

    if(fs.existsSync(CONFIG_FILE)){
        settings = JSON.parse(fs.readFileSync(CONFIG_FILE));
    }
    return settings;
}

function trySaveSettings(settings){
    if(!fs.existsSync(CONFIG_HOME)){
        fs.mkdirSync(CONFIG_HOME);
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(settings));
}

/** MAIN */

const shell = new InteractiveSolidityShell(tryLoadSettings());

const vorpal = new Vorpal()
    .delimiter('')
    .show()
    .parse(process.argv);

process.on('exit', () => { shell.blockchain.stopService(); trySaveSettings(shell.settings) });


vorpal
    .mode('repl', 'Enters Solidity Shell Mode')
    .delimiter(c.bold('» '))
    .init(function (args, cb) {
        this.log('🚀 Entering interactive Solidity shell. Type \'.help\' for help, \'.exit\' to exit.');
        return cb();
    })
    .action(function (input, cb) {
        let command = multilineInput(input);
        if (command.startsWith('.')) {
            let commandParts = command.split(' ');
            switch (commandParts[0]) {
                case '.help':
                    cb(`
📚 Help:
   -----

    .help                    ... this help :)
    .exit                    ... exit the shell

    .config                  ... show settings
    .set   <key> <value>     ... set setting
    .unset <key>             ... clear setting
    
    .reset                   ... reset cmd history. start from scratch.
    .undo                    ... undo last command


cheers 🙌 
    @tintinweb 
    ConsenSys Diligence @ https://diligence.consensys.net/
`);

                    break; //show usage
                case '.exit': process.exit(); return; //exit -> no more cb()
                case '.reset': shell.reset(); break; //reset complete state
                case '.undo': shell.revert(); break; //revert last action
                case '.set': shell.setSetting(commandParts[1], convert(commandParts[2])); break;
                case '.unset': shell.setSetting(commandParts[1], undefined); break;
                case '.config': return cb(shell.settings); break;
                default:
                    console.error(`unknown command: ${command}. type '.help' for a list of commands.`);
            }
            // meta commands
            return cb();
        }

        const statement = new SolidityStatement(command);

        /* REPL cmd */
        shell.run(statement).then(res => {
            cb(c.bold(c.yellow(res)));
        }).catch(errors => {
            console.error(errors)
            cb()
        })
    });


vorpal.execSync("repl")
