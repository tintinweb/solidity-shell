[<img width="200" alt="get in touch with Consensys Diligence" src="https://user-images.githubusercontent.com/2865694/56826101-91dcf380-685b-11e9-937c-af49c2510aa0.png">](https://diligence.consensys.net)<br/>
<sup>
[[  🌐  ](https://diligence.consensys.net)  [  📩  ](https://github.com/ConsenSys/vscode-solidity-doppelganger/blob/master/mailto:diligence@consensys.net)  [  🔥  ](https://consensys.github.io/diligence/)]
</sup><br/><br/>


## Solidity Shell

An interactive Solidity shell with lightweight session recording and remote compiler support.

[💾](https://www.npmjs.com/package/solidity-shell) `npm install -g solidity-shell` 

```javascript
⇒  solidity-shell
 
🚀 Entering interactive Solidity shell. '.help' and '.exit' are your friends.
 »  ℹ️  ganache-mgr: starting temp. ganache instance ...
 »
 »  uint a = 100
 »  uint b = 200
 »  a + b + 2 + uint8(50)
352
 »  $_
352
```

Oh, did you know that we automatically fetch a matching remote compiler when you change the solidity pragma? It is as easy as typing `pragma solidity 0.5.0` and solidity-shell will do the rest 🙌.



### Hints

* `pragma solidity <version>` attempts to dynamically load the selected compiler version (remote compiler, may take a couple of seconds).
* use `{ <statement>; }` to ignore a calls return value. 
* Sessions can be saved and restored using the `.session` command. Your previous session is always stored and can be loaded via `.session load previous` (not safe when running concurrent shells).
* `.reset` completely removes all statements. `.undo` removes the last statement.
* See what's been generated under the hood? call `.dump`.
* Settings are saved on exit (not safe when running concurrent shells). call `config set <key> <value>` to change settings like ganache port, ganache autostart, etc.
* `$_` is a placeholder for the last known result. Feel free to use that placeholder in your scripts :)
* Special commands are dot-prefixed. Everything else is evaluated as Solidity code.
* `import "<path>"` assumes that `path` is relative to the current working-dir (CWD) or `{CWD}/node_modules/`. There's experimental support for HTTPs URL's. You can disable https resolving by setting ` »  .config set resolveHttpImports false`.
    
```solidity
 »  import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/master/contracts/token/ERC721/IERC721.sol"
```


### Usage

#### Cmdline Passthru

Any arguments provided after an empty `--` are directly passed to `ganacheCmd` (default: `ganache-cli`). This way, for example, you can start a solidity shell on a ganache fork of mainnet via infura. Check `ganache-cli --help` for a list of available options.

```shell
⇒  solidity-shell -- --fork https://mainnet.infura.io/v3/yourApiToken
 
🚀 Entering interactive Solidity shell. Type '.help' for help, '.exit' to exit.
 »  ℹ️  ganache-mgr: starting temp. ganache instance ...
 »
 »  interface ERC20 {
multi> function name() external view returns (string memory);
multi> }
 
 »  ERC20(0xB8c77482e45F1F44dE1745F52C74426C631bDD52).name()
BNB

```

#### Repl

```shell
🚀 Entering interactive Solidity ^0.8.11 shell. '.help' and '.exit' are your friends.
 »  ℹ️  ganache-mgr: starting temp. ganache instance ...
 »
 »  .help

📚 Help:
   -----

 $_ is a placeholder holding the most recent evaluation result.
 pragma solidity <version> to change the compiler version.


 General:
    .help                                ... this help :)
    .exit                                ... exit the shell

 Source:
    .fetch 
            interface <address> <name> [chain=mainnet] ... fetch and load an interface declaration from an ABI spec on etherscan.io

 Blockchain:
    .chain                         
            restart                      ... restart the blockchain service
            set-provider <fork-url>      ... "internal" | <shell-command: e.g. ganache-cli> | <https://localhost:8545>
                                            - fork url e.g. https://mainnet.infura.io/v3/yourApiKey  
            accounts                     ... return eth_getAccounts
            eth_<X> [...args]            ... initiate an arbitrary eth JSONrpc method call to blockchain provider.

 Settings:
    .config                              ... show settings
            set <key> <value>            ... set setting
            unset <key>                  ... unset setting
 Session:
    .session                             ... list sessions
            load <id>                    ... load session
            save <id>                    ... save session
    .undo                                ... undo last command
    .reset                               ... reset cmd history. start from scratch.

 Debug:
    .proc                                ... show processes managed by solidity-shell (ganache)
    .dump                                ... show template contract
    .echo                                ... every shell needs an echo command


cheers 🙌 
    @tintinweb 
    ConsenSys Diligence @ https://consensys.net/diligence/
    https://github.com/tintinweb/solidity-shell/ 

```

## Examples 


![solidity-shell](https://user-images.githubusercontent.com/2865694/131328119-e363f20a-f627-43fc-8801-8d6613ad740f.gif)


### Transaction vars: `msg.sender` etc.

```javascript
 »  msg.sender
0x70e9B09abd6A13D2F5083CD5814076b77427199F
 »  address(uint160(address(msg.sender)))
0x70e9B09abd6A13D2F5083CD5814076b77427199F
```

### Contracts, Structs, Functions

```javascript
⇒  solidity-shell
 
🚀 Entering interactive Solidity shell. Type '.help' for help, '.exit' to exit.
 »  ℹ️  ganache-mgr: starting temp. ganache instance ...
 »
 »  contract TestContract {}
 »  new TestContract()
0xFBC1B2e79D816E36a1E1e923dd6c6fad463F4368
 »  msg.sender
0x363830C6aee2F0c43922bcB785C570a7cca613b5
 »  block.timestamp
1630339581
 »  struct yolo {uint8 x; uint8 y;}
 »  function mytest(uint x) public pure returns(uint) {
multi> return x -5;
multi> }
 »  mytest(100)
95
```

![solidity-shell2](https://user-images.githubusercontent.com/2865694/131328490-e211e89b-ac59-4729-972b-3e3b19b75cfc.gif)

### Advanced usage

```javascript
 »  struct yolo {uint8 x; uint8 y;}
 »  .dump
// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.7;

contract TestContract {}

struct yolo {uint8 x; uint8 y;}

contract MainContract {

    

    function main() public  {
        uint a = 100;
        uint b = 200;
        a + b + 2 + uint8(50);
        new TestContract();
        msg.sender;
        block.timestamp;
        return ;
    }
}
```

### Fetch Interface Declaration from Etherscan

![shell-fetch-interface](https://user-images.githubusercontent.com/2865694/183062446-c952b308-9fc7-49f9-8308-3eac09ca3b4a.gif)


`.fetch interface <address> <interfaceName> [optional: chain=mainnet]`

```
⇒  solidity-shell --fork https://mainnet.infura.io/v3/<yourApiKey>                                                                                                
 
🚀 Entering interactive Solidity ^0.8.16 shell (🧁:Ganache built-in). '.help' and '.exit' are your friends.
 »  
 »  .fetch interface 0x40cfEe8D71D67108Db46F772B7e2CD55813Bf2FB Test
 »  interface Test {
    
    ... omitted ...

    function symbol() external view returns (string memory);

    function tokenURI(uint256 tokenId) external view returns (string memory);

    function totalSupply() external view returns (uint256);

    function transferFrom(
        address from,
        address to,
        uint256 tokenId
    ) external;

    function transferOwnership(address newOwner) external;

    function withdraw() external;
}

 »  Test t = Test(0x40cfEe8D71D67108Db46F772B7e2CD55813Bf2FB)
 »  t.symbol()
MGX
```
____


## Acknowledgements

* Inspired by the great but unfortunately unmaintained [solidity-repl](https://github.com/raineorshine/solidity-repl).
* Fetch interfaces from Etherscan is powered by [abi-to-sol](https://github.com/gnidan/abi-to-sol)
