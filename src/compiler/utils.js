'use strict'
/**
 * @author github.com/tintinweb
 * @license MIT
 * */

const fs = require('fs');

function readFileCallback(sourcePath, options) {
    options = options || {};
    if (sourcePath.startsWith("https://") && options.allowHttp) {
        //allow https! imports; not yet implemented
        const res = require('sync-request')('GET', sourcePath); //@todo: this is super buggy and might freeze the app. needs async/promises.
        return { contents: res.getBody('utf8') };
    }
    else {
        const prefixes = [options.basePath ? options.basePath : ""].concat(
            options.includePath ? options.includePath : []
        );
        for (const prefix of prefixes) {
            const prefixedSourcePath = (prefix ? prefix + '/' : "") + sourcePath;
            if (fs.existsSync(prefixedSourcePath)) {
                try {
                    return { contents: fs.readFileSync(prefixedSourcePath).toString('utf8') }
                } catch (e) {
                    return { error: 'Error reading ' + prefixedSourcePath + ': ' + e };
                }
            }
        }
    }
    return { error: 'File not found inside the base path or any of the include paths.' }
}



module.exports = {
    readFileCallback
}