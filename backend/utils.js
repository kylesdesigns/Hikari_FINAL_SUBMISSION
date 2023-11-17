require("dotenv").config();
const { ContractFactory, ethers } = require("ethers");
const crypto = require("crypto");

const { HIKARI_ADDR } = require("./abis/address");
const ERC20ABI = require("./abis/ERC20ABI.json");
const HIKARIABI = require("./abis/HIKARIABI.json");
const FactoryV2ABI = require("./abis/IUniswapV2Factory.json");
const RouterV2ABI = require("./abis/IUniswapV2Router02.json");
const RouterV3ABI = require("./abis/IUniswapV3Router.json");
const PairV2ABI = require("./abis/IUniswapV2Pair.json");
const UniswapV2TWAP = require("./abis/UniswapV2TWAP.json");

const encrypt = (text) => {
  let iv = crypto.randomBytes(Number(process.env.IV_LENGTH));
  let cipher = crypto.createCipheriv(
    "aes-256-cbc",
    Buffer.from(process.env.ENCRYPTION_KEY),
    iv
  );
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString("hex") + "::" + encrypted.toString("hex");
};

const decrypt = (text) => {
  try {
    let textParts = text.split("::");
    let iv = Buffer.from(textParts.shift(), "hex");
    let encryptedText = Buffer.from(textParts.join("::"), "hex");
    let decipher = crypto.createDecipheriv(
      "aes-256-cbc",
      Buffer.from(process.env.ENCRYPTION_KEY),
      iv
    );
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    // console.log("private  key",  decrypted.toString());
    return decrypted.toString();
  } catch (e) {
    return "";
  }
};

const RPC_ENDPOINT =
  "https://mainnet.infura.io/v3/fa0f791c620c4507a1fe2d88c5fefe1b";
// const RPC_ENDPOINT =
//   "https://goerli.infura.io/v3/c154d90315a647ecace24c4afa8c1b3b";

const addresses = {
  twapAddress: "0xFa3eCB75d38a4fD7Fa7B48BC7e8DB2319b5579dc",
  WETHV2: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  factoryV2: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f",
  routerV2: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
  WETHV3: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  factoryV3: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
  routerV3: "0xe592427a0aece92de3edee1f18e0157c05861564",
};

const getContract = (abi, address, signer) => {
  const simpleRpcProvider = new ethers.providers.JsonRpcProvider(RPC_ENDPOINT);
  const signerOrProvider = signer ?? simpleRpcProvider;
  return new ethers.Contract(address, abi, signerOrProvider);
};

const getTokenContract = (address, signer) => {
  return getContract(ERC20ABI, address, signer);
};

const getHikariContract = (signer) => {
  return getContract(HIKARIABI, HIKARI_ADDR, signer);
};

const getFactoryV2Contract = (signer) => {
  return getContract(FactoryV2ABI, addresses.factoryV2, signer);
};

const getRouterV2Contract = (signer) => {
  return getContract(RouterV2ABI, addresses.routerV2, signer);
};

const getCustomRouterV2Contract = (routerAddress, signer) => {
  return getContract(RouterV2ABI, routerAddress, signer);
};

const getRouterV3Contract = (signer) => {
  return getContract(RouterV3ABI, addresses.routerV2, signer);
};

const getPairV2Contract = (pairAddress, signer) => {
  return getContract(PairV2ABI, pairAddress, signer);
};

const getV2OracleFactory = async (signer) => {
  const uniswapV2OracleFactory = new ContractFactory(
    UniswapV2TWAP.abi,
    UniswapV2TWAP.bytecode,
    signer
  );
  return uniswapV2OracleFactory;
};

const getV2OracleFactoryContract = (twapAddress, signer) => {
  return getContract(UniswapV2TWAP.abi, twapAddress, signer);
};

module.exports = {
  encrypt,
  decrypt,
  RPC_ENDPOINT,
  addresses,
  getContract,
  getTokenContract,
  getHikariContract,
  getFactoryV2Contract,
  getRouterV2Contract,
  getCustomRouterV2Contract,
  getRouterV3Contract,
  getPairV2Contract,
  getV2OracleFactory,
  getV2OracleFactoryContract,
};
