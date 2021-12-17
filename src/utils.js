'use strict'
/**
 * @author github.com/tintinweb
 * @license MIT
 * */

function convert(str){
    switch(str){
        case '': return undefined; 
        case 'true': return true;
        case 'false': return false;
    }
    try {
        let num = parseInt(str);
        if(!isNaN(num)) return num;
    } catch {}

    return str;
}

function multilineInput(command){
    while (true) {

        let numBrOpen = command.split('{').length - 1;
        let numBrClose = command.split('}').length - 1;

        if (numBrOpen === numBrClose) {
            break;
        }

        const rl = require('readline-sync');
        command += '\n' + rl.question("... ").trim()
    }
    return command;
}

module.exports = {
    convert,
    multilineInput
}