'use strict'
/**
 * @author github.com/tintinweb
 * @license MIT
 * */
/** IMPORT */
const { solcVersions } = require('./solcVersions.js')
const request = require('request');

function normalizeSolcVersion(version) {
    return version.replace('soljson-', '').replace('.js', '');
}

function getSolcJsCompilerList(options){
    options = options || {};
    return new Promise((resolve, reject) => {
        request.get('https://solc-bin.ethereum.org/bin/list.json', (err, res, body) => {
            if(err){
                return reject(err)
            }else{
                let data = JSON.parse(body);
                let releases = Object.values(data.releases)

                if(options.nightly){
                    releases = Array.from(new Set([...releases, ...data.builds.map(b => b.path)]));
                }
                return resolve(releases.map(normalizeSolcVersion))
            }
        })
    });
}

function getRemoteCompiler(solidityVersion) {
    return new Promise((resolve, reject) => {

        //check if version is in static list (avoid http requests)
        let remoteSolidityVersion = solcVersions.find(
            (e) => !e.includes('nightly') && e.includes(`v${solidityVersion}`)
        )

        if (remoteSolidityVersion) { 
            return resolve(remoteSolidityVersion);
        }
        //download remote compiler list and check again.
        getSolcJsCompilerList().then(solcJsCompilerList => {
            let found = solcJsCompilerList.find(
                (e) => !e.includes('nightly') && e.includes(`v${solidityVersion}`)
            )
            if (found) {
                return resolve(found);
            }
            return reject(`No compiler found for version ${solidityVersion}`);
        })

    });
}


module.exports = {
    getRemoteCompiler,
    getSolcJsCompilerList
}

