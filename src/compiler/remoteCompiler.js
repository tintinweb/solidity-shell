'use strict'
/**
 * @author github.com/tintinweb
 * @license MIT
 * */
/** IMPORT */
const { solcVersions } = require('./autogenerated/solcVersions.js')
const {generateSolidity} = require('abi-to-sol')
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
            return reject(new Error(`No compiler found for version ${solidityVersion}`));
        })

    });
}

//.import interface 0x40cfee8d71d67108db46f772b7e2cd55813bf2fb test2
function getRemoteInterfaceFromEtherscan(address, name, chain){
    return new Promise((resolve, reject) => {

        let provider = `https://api${(!chain || chain=="mainnet")? "" : `-${chain}`}.etherscan.io`
        let url = `${provider}/api?module=contract&action=getabi&address=${address}`;
        request.get(url, (err, res, body) => {
            if(err){
                return reject(err)
            }else{
                let data = JSON.parse(body);

                let abi = JSON.parse(data.result);
                let src = generateSolidity({name:name, solidityVersion:"0.8.9", abi});
                src = src.substring(src.indexOf("\n\n")+2, src.indexOf("// THIS FILE WAS AUTOGENERATED FROM"));
                console.log(src)
                return resolve(src)
            }
        })
    });
}

module.exports = {
    getRemoteCompiler,
    getSolcJsCompilerList,
    getRemoteInterfaceFromEtherscan
}

