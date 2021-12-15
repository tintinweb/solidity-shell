# Change Log
All notable changes will be documented in this file.

## v0.0.8
- new: Passthru ganache-cli settings as options to solidity-shell #7
```shell
⇒ solidity-shell -- -fork https://mainnet.infura.io/v3/yourToken
```
- fix: `.config set` handling of strings and multi-word arguments

## v0.0.7
- fix: rework remote compiler
  - added a remoteCompiler wrapper
- fix: always use latest compiler shipped with this package by default
  - new: ship with solc 0.8.10
  - preference: use solc shipped with package by default, else check static solcVersions list and fetch remote compiler, else update solcVersions list and fetch remote compiler.
- fix: better error handling when changing compiler version
- new: support `error` keyword and fix memory/storage type declarations

## v0.0.6
- fix: handle interface declarations

## v0.0.5
- fix: support blocks/loops - #2
- fix: better ganache error handling and minor refactoring

## v0.0.4
- new: dynamic compiler selection via pragma directive
  - changing the solidity version pragma attempts to load the selected compiler version remotely. e.g. type `pragma solidity 0.8.4` to switch to solidity v0.8.4.

## v0.0.1 - 0.0.3

- first alpha
