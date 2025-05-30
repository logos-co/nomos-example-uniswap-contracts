const Web3 = require("web3");
const Factory = require("./node_modules/@uniswap/v2-core/build/UniswapV2Factory.json");
const Router = require("./node_modules/@uniswap/v2-periphery/build/UniswapV2Router02.json");
const ERC20 = require("./node_modules/@openzeppelin/contracts/build/contracts/ERC20PresetFixedSupply.json");
const Pair = require("./node_modules/@uniswap/v2-core/build/UniswapV2Pair.json");
const WETH = require("./node_modules/canonical-weth/build/contracts/WETH9.json");

// Configuration Constants
const DEFAULT_RPC = "http://localhost:8545";
const DEFAULT_GAS_PRICE = 0.000005;
const DEFAULT_GAS_LIMIT = 6000000;
const ENV_VAR_NAMES = {
  RPC: "UNISWAP_DEPLOYER_RPC",
  PRIVATE_KEY: "UNISWAP_DEPLOYER_PRIVATE_KEY",
  GAS_PRICE: "UNISWAP_DEPLOYER_GAS_PRICE",
  GAS_LIMIT: "UNISWAP_DEPLOYER_GAS_LIMIT",
};

function getConfig() {
  const config = {
    RPC: process.env[ENV_VAR_NAMES.RPC] || DEFAULT_RPC,
    PRIVATE_KEY: process.env[ENV_VAR_NAMES.PRIVATE_KEY]?.trim(),
    GAS_PRICE: process.env[ENV_VAR_NAMES.GAS_PRICE] || DEFAULT_GAS_PRICE,
    GAS_LIMIT: process.env[ENV_VAR_NAMES.GAS_LIMIT] || DEFAULT_GAS_LIMIT,
  };

  // Validate Private Key
  if (!config.PRIVATE_KEY) {
    console.error(`\x1b[31mERROR:\x1b[0m ${ENV_VAR_NAMES.PRIVATE_KEY} must be provided`);
    console.log('\nUsage:');
    console.log(`  ${ENV_VAR_NAMES.RPC}=<rpc_url> ${ENV_VAR_NAMES.PRIVATE_KEY}=<pk> ${ENV_VAR_NAMES.GAS_PRICE}=<gas_price> ${ENV_VAR_NAMES.GAS_LIMIT}=<gas_limit> node deploy-contracts.js`);
    process.exit(1);
  } else {
    if (config.PRIVATE_KEY.length !== 66 || !config.PRIVATE_KEY.startsWith('0x')) {
      console.error(`\x1b[31mERROR:\x1b[0m '${ENV_VAR_NAMES.PRIVATE_KEY}' must be 66 characters long (including 0x prefix)`);
      console.error(`Received: ${config.PRIVATE_KEY.slice(0, 8)}... (length: ${config.PRIVATE_KEY.length})`);
      process.exit(1);
    }
  }

  return config;
}

// Load configuration
const { RPC, PRIVATE_KEY, GAS_PRICE, GAS_LIMIT } = getConfig();
console.log('Configuration loaded:');
console.log(`- RPC Endpoint: ${RPC}`);
console.log(`- Private Key: ${PRIVATE_KEY.slice(0, 6)}...${PRIVATE_KEY.slice(-4)}`);
console.log(`- Gas Price: ${GAS_PRICE}`);
console.log(`- Gas Limit: ${GAS_LIMIT}`);
console.log('');

// deploy Weth
async function deployWeth(web3, sender) {
  try {
    let weth = new web3.eth.Contract(WETH.abi);
    weth = await weth
      .deploy({ data: WETH.bytecode })
      .send({ from: sender, gas: GAS_LIMIT, gasprice: GAS_PRICE })

    console.log("Weth address:", weth.options.address);

    return weth.options.address;
  } catch (error) {
    console.log('Weth deployment went wrong! Lets see what happened...')
    console.log(error)
  }
}

// deploy two ERC20 contracts
async function deployTokens(web3, sender) {
  try {
    let tokenMem = new web3.eth.Contract(ERC20.abi);
    let tokenNmo = new web3.eth.Contract(ERC20.abi);

    tokenMem = await tokenMem
      .deploy({
        data: ERC20.bytecode,
        arguments: [
          "Mehmet",
          "MEM",
          // 18,
          web3.utils.toWei("9999999999999999999", "ether"),
          sender,
        ],
      })
      .send({ from: sender, gas: GAS_LIMIT, gasprice: GAS_PRICE });

    console.log("MEM Token address:", tokenMem.options.address);

    tokenNmo = await tokenNmo
      .deploy({
        data: ERC20.bytecode,
        arguments: [
          "Nomos",
          "NMO",
          // 18,
          web3.utils.toWei("9999999999999999999", "ether"),
          sender,
        ],
      })
      .send({ from: sender, gas: GAS_LIMIT, gasprice: GAS_PRICE });

    console.log("NMO Token address:", tokenNmo.options.address);

    return [tokenMem.options.address, tokenNmo.options.address];
  } catch (error) {
    console.log('ERC20 deployment went wrong! Lets see what happened...')
    console.log(error)
  }

}

// deploy a uniswapV2Router
async function deployRouter(web3, factoryAddress, wethAddress, sender) {
  try {
    let router = new web3.eth.Contract(Router.abi);
    router = await router
      .deploy({ data: Router.bytecode, arguments: [factoryAddress, wethAddress] })
      .send({ from: sender, gas: GAS_LIMIT, gasprice: GAS_PRICE });

    console.log("Router address:", router.options.address);

    return router.options.address;
  } catch (error) {
    console.log('Router deployment went wrong! Lets see what happened...')
    console.log(error)
  }

}

// deploy a uniswapV2Factory
async function deployFactory(web3, feeToSetter, sender) {
  try {
    let factory = new web3.eth.Contract(Factory.abi);
    factory = await factory
      .deploy({ data: Factory.bytecode, arguments: [feeToSetter] })
      .send({ from: sender, gas: GAS_LIMIT, gasprice: GAS_PRICE });

    console.log("Factory address:", factory.options.address);

    return factory.options.address;
  } catch (error) {
    console.log('Factory deployment went wrong! Lets see what happened...')
    console.log(error)
  }

}

async function approve(tokenContract, spender, amount, sender) {
  try {
    await tokenContract.methods
      .approve(spender, amount)
      .send({ from: sender, gas: GAS_LIMIT, gasprice: GAS_PRICE })
      .on("transactionHash", function (hash) {
        console.log("transaction hash", hash);
      })
      .on("receipt", function (receipt) {
        console.log("receipt", receipt);
      });
  } catch (err) {
    console.log("the approve transaction reverted! Lets see why...");

    await tokenContract.methods
      .approve(spender, amount)
      .call({ from: sender, gas: GAS_LIMIT, gasprice: GAS_PRICE });
  }
}

// check some stuff on a deployed uniswapV2Pair
async function checkPair(
  web3,
  factoryContract,
  tokenMemAddress,
  tokenNmoAddress,
  sender,
  routerAddress
) {
  try {
    console.log("tokenMemAddress: ", tokenMemAddress);
    console.log("tokenNmoAddress: ", tokenNmoAddress);

    const pairAddress = await factoryContract.methods
      .getPair(tokenMemAddress, tokenNmoAddress)
      .call();

    console.log("tokenMem Address", tokenMemAddress);
    console.log("tokenNmo Address", tokenNmoAddress);
    console.log("pairAddress", pairAddress);
    console.log("router address", routerAddress);

    const pair = new web3.eth.Contract(Pair.abi, pairAddress);

    const reserves = await pair.methods.getReserves().call();

    console.log("reserves for tokenMem", web3.utils.fromWei(reserves._reserve0));
    console.log("reserves for tokenNmo", web3.utils.fromWei(reserves._reserve1));
  } catch (err) {
    console.log("the check pair reverted! Lets see why...");
    console.log(err);
  }
}

async function deployUniswap() {
  const web3 = new Web3(RPC);
  const account = web3.eth.accounts.wallet.add(PRIVATE_KEY);
  const myAddress = web3.utils.toChecksumAddress(account.address);

  const wethAddress = await deployWeth(web3, myAddress);
  const weth = new web3.eth.Contract(WETH.abi, wethAddress);

  const factoryAddress = await deployFactory(web3, myAddress, myAddress);
  const factory = new web3.eth.Contract(Factory.abi, factoryAddress);

  const routerAddress = await deployRouter(
    web3,
    factoryAddress,
    wethAddress,
    myAddress
  );
  const router = new web3.eth.Contract(Router.abi, routerAddress);

  // const multicallAddress = await deployMulticall(web3, myAddress);
  // const multicall = new web3.eth.Contract(Multicall.abi, multicallAddress);
  const [tokenMemAddress, tokenNmoAddress] = await deployTokens(web3, myAddress);

  const tokenMem = new web3.eth.Contract(ERC20.abi, tokenMemAddress);
  const tokenNmo = new web3.eth.Contract(ERC20.abi, tokenNmoAddress);

  console.log("# You may also copy this to Nomiswap's .env file:");
  console.log(`REACT_APP_NOMISWAP_ROUTER_ADDRESS=${routerAddress}`);
  console.log(`REACT_APP_NOMISWAP_TOKEN_MEM_ADDRESS=${tokenMemAddress}`);
  console.log(`REACT_APP_NOMISWAP_TOKEN_NMO_ADDRESS=${tokenNmoAddress}`);

  return (tokenMem, tokenMemAddress, tokenNmo, tokenNmoAddress, myAddress, web3, router, routerAddress, factory, weth, wethAddress)
}

async function addLiquidity(tokenA, tokenAAddress, tokenB, tokenBAddress, myAddress, web3, router, routerAddress, factory, weth, wethAddress) {
  // liquidity
  const amountADesired = web3.utils.toWei("10000000", "ether");
  const amountBDesired = web3.utils.toWei("10000000", "ether");
  const amountAMin = web3.utils.toWei("0", "ether");
  const amountBMin = web3.utils.toWei("0", "ether");

  // deadline
  var BN = web3.utils.BN;
  const time = Math.floor(Date.now() / 1000) + 200000;
  const deadline = new BN(time);

  // before calling addLiquidity we need to approve the router
  // we need to approve atleast amountADesired and amountBDesired
  const spender = router.options.address;
  const amountA = amountADesired;
  const amountB = amountBDesired;

  await approve(tokenA, spender, amountA, myAddress);
  await approve(tokenB, spender, amountB, myAddress);
  await approve(weth, wethAddress, amountA, myAddress);
  await approve(weth, spender, amountA, myAddress);

  // try to add liquidity to a non-existen pair contract
  try {
    await router.methods
      .addLiquidity(
        tokenAAddress,
        tokenBAddress,
        amountADesired,
        amountBDesired,
        amountAMin,
        amountBMin,
        myAddress,
        deadline
      )
      .send({
        from: myAddress,
        gas: GAS_LIMIT,
        gasprice: GAS_PRICE,
      })
      .on("transactionHash", function (hash) {
        console.log("transaction hash", hash);
      })
      .on("receipt", function (receipt) {
        console.log("receipt", receipt);
      });
  } catch (err) {
    console.log("the addLiquidity transaction reverted! Lets see why...");

    await router.methods
      .addLiquidity(
        tokenAAddress,
        tokenBAddress,
        amountADesired,
        amountBDesired,
        amountAMin,
        amountBMin,
        myAddress,
        deadline
      )
      .call({
        from: myAddress,
        gas: GAS_LIMIT,
        gasprice: GAS_PRICE,
      });
  }

  await checkPair(
    web3,
    factory,
    tokenAAddress,
    tokenBAddress,
    myAddress,
    routerAddress
  );
}

deployUniswap();
