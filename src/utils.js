'use strict'
/**
 * @author github.com/tintinweb
 * @license MIT
 * */

const fs = require('fs');

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

function readFileCallback(sourcePath, options) {
    options = options || {};
    const prefixes = [options.basePath ? options.basePath : ""].concat(
        options.includePath ? options.includePath : []
    );
    for (const prefix of prefixes) {
        const prefixedSourcePath = (prefix ? prefix + '/' : "") + sourcePath;
        if (fs.existsSync(prefixedSourcePath)) {
            try {
                return { 'contents': fs.readFileSync(prefixedSourcePath).toString('utf8') }
            } catch (e) {
                return { error: 'Error reading ' + prefixedSourcePath + ': ' + e };
            }
        }
    }
    return { error: 'File not found inside the base path or any of the include paths.' }
}

module.exports = {
    convert,
    multilineInput,
    readFileCallback
}