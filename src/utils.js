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
        return parseInt(str);
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
        command += '\n' + rl.question("multi> ").trim()
    }
    return command;
}

module.exports = {
    convert,
    multilineInput
}