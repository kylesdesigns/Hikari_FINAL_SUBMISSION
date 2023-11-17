require("dotenv").config();

const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require("path");
const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
const helmet = require("helmet");
const HIKARI_ABI = require("./abis/HIKARI.json");
const app = express();

// cross origin
const allowedOrigins = [
    "http://localhost:3001",
    "http://localhost:5173",
    "https://coruscating-kelpie-18ba50.netlify.app",
    "https://coruscating-kelpie-18ba50.netlify.app",
    "https://hikariswap.io",
];

app.use(
    cors({
        origin: function(origin, callback) {
            // allow requests with no origin
            // (like mobile apps or curl requests)
            if (!origin) return callback(null, true);
            if (allowedOrigins.indexOf(origin) === -1) {
                const msg =
                    "The CORS policy for this site does not " +
                    "allow access from the specified Origin.";
                return callback(new Error(msg), false);
            }
            return callback(null, true);
        },
    })
);

// Use the helmet middleware
app.use(helmet());

// Set the Content Security Policy
app.use(
    helmet.contentSecurityPolicy({
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
        },
    })
);

const PORT = 4000;

const { ethers, BigNumber } = require("ethers");
const Web3 = require("web3");
const {
    encrypt,
    decrypt,
    getTokenContract,
    getRouterV2Contract,
    getRouterV3Contract,
    addresses,
    getFactoryV2Contract,
    getPairV2Contract,
    getCustomRouterV2Contract,
} = require("./utils");
const { db } = require("./firebase");
const { puppeteer } = require("puppeteer");

// let url = 'https://goerli.infura.io/v3/92f7be829e29483492b5def8057687fd'
let url = "https://mainnet.infura.io/v3/fa0f791c620c4507a1fe2d88c5fefe1b";
const hikariAddress = "0xd4126f195a8de772eeffa61a4ab6dd43462f4e39";
let provider = new ethers.providers.JsonRpcProvider(url);
let web3Provider = new Web3.providers.HttpProvider(url);
let web3 = new Web3(web3Provider);
const signer = new ethers.Wallet(decrypt(process.env.MAINPRIVE), provider);
const uniswapRouter = getRouterV2Contract(signer);
const gasLimit = 610000;

const formatNumber = (amount) => {
    amount = `${amount}`;
    if (amount.indexOf(".") != -1) {
        if (amount.split(".")[1].length > 18) {
            amount = Number(amount).toFixed(18);
        }
    }
    return Number(Number(amount).toFixed(5));
};

const formatNumberToBigNumber = (amount, decimal) => {
    const rAmount = ethers.utils.parseUnits(`${amount}`, decimal);
    return rAmount;
};

function nuberToString(num) {
    return ("" + +num).replace(
        /(-?)(\d*)\.?(\d*)e([+-]\d+)/,
        function(a, b, c, d, e) {
            return e < 0 ?
                b + "0." + Array(1 - e - c.length).join(0) + c + d :
                b + c + d + Array(e - d.length + 1).join(0);
        }
    );
}

const swap = async(tokenASymbol, tokenA, tokenBSymbol, tokenB, amount) => {
    amount = nuberToString(formatNumber(amount));
    console.log(`buy amount ${amount}`);
    try {
        if (tokenASymbol === "ETH") {
            console.log(`using swap 1`);
            const routerinstance = await uniswapRouter.swapExactETHForTokens(
                0, [addresses.WETHV2, tokenB],
                signer.address,
                ethers.constants.MaxUint256, {
                    value: ethers.utils.parseEther(amount),
                }
            );
            await routerinstance.wait();
            return true;
        } else if (tokenBSymbol === "ETH") {
            console.log(`using swap 2`);
            const tokenContract1 = getTokenContract(tokenA, signer);
            const approveInstance = await tokenContract1.approve(
                addresses.routerV2,
                ethers.utils.parseEther(amount)
            );
            await approveInstance.wait();

            const routerinstance =
                await uniswapRouter.swapExactTokensForETHSupportingFeeOnTransferTokens(
                    ethers.utils.parseEther(amount),
                    0, [tokenA, addresses.WETHV2],
                    signer.address,
                    ethers.constants.MaxUint256
                );
            await routerinstance.wait();
            return true;
        } else {
            console.log(`using swap 3`);
            const tokenContract1 = getTokenContract(tokenA, signer);
            const approveInstance = await tokenContract1.approve(
                addresses.routerV2,
                ethers.utils.parseEther(amount)
            );
            await approveInstance.wait();

            const routerinstance = await uniswapRouter.swapExactTokensForTokens(
                ethers.utils.parseEther(amount),
                0, [tokenA, tokenB],
                signer.address,
                ethers.constants.MaxUint256
            );
            await routerinstance.wait();
            return true;
        }
    } catch (error) {
        console.log(error);
        return false;
    }
};

const transferETH = async(dest, amount) => {
    amount = formatNumber(amount);
    try {
        const gas = await provider.estimateGas({
            to: dest,
            from: signer.address,
            value: ethers.utils.parseEther(`${amount}`),
        });

        console.log("gas:", gas);
        let gasInBigNumber = ethers.BigNumber.from(gas);
        console.log("gas number:", gasInBigNumber);
        const gasPrice = await provider.getGasPrice();
        const gasPriceInGwei = ethers.utils.formatUnits(gasPrice, "gwei");
        console.log("calculated:", gasInBigNumber.toNumber() * gasPriceInGwei);

        let gasInEth = (gasInBigNumber.toNumber() * gasPriceInGwei) / 1000000000;

        console.log(`sending amount:${amount - gasInEth}`);
        const nonce = await provider.getTransactionCount(signer.address, "latest");

        const tx = {
            from: signer.address,
            to: dest,
            value: ethers.utils.parseEther(`${amount - gasInEth}`),
            nonce: nonce,
        };
        const txWait = await signer.sendTransaction(tx);
        await txWait.wait();
        return true;
    } catch (error) {
        console.log(error);
        return false;
    }
};

const transferETHTwap = async(dest, amount) => {
    amount = formatNumber(amount);
    try {
        const gas = await provider.estimateGas({
            to: dest,
            from: signer.address,
            value: ethers.utils.parseEther(`${amount}`),
        });

        console.log("gas:", gas);
        let gasInBigNumber = ethers.BigNumber.from(gas);
        console.log("gas number:", gasInBigNumber);
        const gasPrice = await provider.getGasPrice();
        const gasPriceInGwei = ethers.utils.formatUnits(gasPrice, "gwei");
        console.log("calculated:", gasInBigNumber.toNumber() * gasPriceInGwei);

        let gasInEth = (gasInBigNumber.toNumber() * gasPriceInGwei) / 1000000000;

        console.log(`sending remaining amount:${amount} minus gas: ${gasInEth}`);

        console.log("Amount to send:", Number(amount - gasInEth));

        const nonce = await provider.getTransactionCount(signer.address, "latest");

        const tx = {
            from: signer.address,
            to: dest,
            value: ethers.utils.parseEther(`${Number(amount - gasInEth)}`),
            nonce: nonce,
        };
        const txWait = await signer.sendTransaction(tx);
        await txWait.wait();
        return true;
    } catch (error) {
        console.log(error);
        return false;
    }
};

const transferWithoutGas = async(dest, amount) => {
    amount = formatNumber(amount);
    try {


        console.log(`sending amount:${amount}`);
        const nonce = await provider.getTransactionCount(signer.address, "latest");

        const tx = {
            from: signer.address,
            to: dest,
            value: ethers.utils.parseEther(`${amount}`),
            nonce: nonce,
        };
        const txWait = await signer.sendTransaction(tx);
        await txWait.wait();
        return true;
    } catch (error) {
        console.log(error);
        return false;
    }
};

const transferToken = async(dest, tokenA, amount) => {
    amount = formatNumber(amount);
    try {
        const tokenContract = getTokenContract(tokenA, signer);
        const decimals = await tokenContract.decimals();
        const rAmount = formatNumberToBigNumber(amount, decimals);
        // const transferInstance = await tokenContract.transfer(dest, rAmount);

        const transaction = await tokenContract
            .connect(signer)
            .populateTransaction.transfer(dest, rAmount, {
                // gasLimit: gasLimit,
            });

        // Send the transaction
        await signer.sendTransaction(transaction);
        return true;
    } catch (error) {
        console.log(error);
        return false;
    }
};

const estimateTokenPrice = async(tokenA, tokenB, amount) => {
    amount = `${amount}`;
    if (amount.indexOf(".") != -1) {
        if (amount.split(".")[1].length > 18) {
            amount = Number(amount).toFixed(18);
        }
    }
    const [amountOut1, amountOut2] = await uniswapRouter.getAmountsIn(
        `${ethers.utils.parseEther(amount)}`, [tokenA, tokenB]
    );

    return Number(ethers.utils.formatUnits(amountOut1.toString()));
};

const getCurrentVolume = async(
    tokenAsymbol,
    tokenAaddress,
    tokenBsymbol,
    tokenBaddress
) => {
    const factory = getFactoryV2Contract(signer);

    let tokenAContract, tokenBContract, totalSupply;
    if (tokenAsymbol !== "ETH") {
        tokenAContract = getTokenContract(tokenAaddress, signer);

        totalSupply = await tokenAContract.totalSupply();
    } else {
        tokenAaddress = addresses.WETHV2;
    }
    if (tokenBsymbol !== "ETH") {
        tokenBContract = getTokenContract(tokenBaddress, signer);

        totalSupply = await tokenBContract.totalSupply();
    } else {
        tokenBaddress = addresses.WETHV2;
    }

    const pairAddress = await factory.getPair(tokenAaddress, tokenBaddress);
    const pairContract = getPairV2Contract(pairAddress, signer);

    let [reserve0, reserve1] = await pairContract.getReserves();
    let price = Number(reserve0) / Number(reserve1);
    const volume = totalSupply * price;
    return volume;
};

const orderCheckBack = async() => {
    // console.log(
    //   `======================== order checking start ${new Date().getMinutes()} ========================`
    // );
    var res;
    try {
        res = await db.collection("orders").where("otc", "==", 1).get();
    } catch (error) {
        console.log(error);
        res = await db.collection("orders").where("otc", "==", 1).get();
    }

    var orderList = res.docs.map((doc) => doc.data());
    const orderIDs = res.docs.map((doc) => doc.id);
    if (orderList.length > 0) {
        for (let i = 0; i < orderList.length; i++) {
            const currentTime = new Date().getTime();

            let {
                _owner,
                sellTokenSymbol,
                sellTokenAddress,
                sellTokenAmount,
                duration,
                createdAt,
                endTime,
            } = orderList[i];

            console.log("created at", createdAt);
            console.log("duration", duration);
            console.log("current time", currentTime);

            if (endTime != false) continue;

            if (createdAt + duration * 60 * 1000 < currentTime) {
                if (sellTokenSymbol === "ETH") {
                    console.log(`Refunding ETH to owner`);
                    await transferETH(_owner, sellTokenAmount);
                } else {
                    console.log(
                        `Refunding ${sellTokenAmount} ${sellTokenSymbol} to owner`
                    );
                    await transferToken(_owner, sellTokenAddress, sellTokenAmount);
                }
                await db.collection("orders").doc(orderIDs[i]).update({
                    endTime: new Date().getTime(),
                    otc: 3,
                });
                console.log(`refunded to ${_owner}`);
            }
        }
    }
};

const twap = async() => {
    var res;
    try {
        res = await db.collection("twap").get();
    } catch (error) {
        console.log(error);
        res = await db.collection("twap").get();
    }

    try {
        // twap
        var twapList = res.docs.map((doc) => doc.data());
        const twapIDs = res.docs.map((doc) => doc.id);
        if (twapList.length > 0) {
            for (let i = 0; i < twapList.length; i++) {
                const currentTime = new Date().getTime();
                let {
                    _owner,
                    sourceToken,
                    sourceTokenBalance,
                    buyAmount,
                    buyEveryX,
                    targetToken,
                    targetTokenBalance,
                    sellAmount,
                    sellEveryX,
                    duration,
                    during,
                    endTime,
                    orderId,
                    network,
                    otcAmount,
                    buyNum,
                    sellNum
                } = twapList[i];

                during += 1;
                if (network == 1) {
                    if (endTime != false) continue; // console.log( //   `======================== twap start ${new Date().getMinutes()} ========================` // );
                    // console.log(twapList[i]);
                    console.log("here");
                    if (buyEveryX > 0 && during % buyEveryX === 0) {
                        if (buyNum < buyEveryX) {
                            console.log(`twap buy amount in => ${buyAmount}`);
                            const amountOut = await estimateTokenPrice(
                                targetToken.symbol === "ETH" ?
                                addresses.WETHV2 :
                                targetToken.address,
                                sourceToken.symbol === "ETH" ?
                                addresses.WETHV2 :
                                sourceToken.address,
                                buyAmount
                            );
                            const resultStatus = await swap(
                                sourceToken.symbol,
                                sourceToken.address,
                                targetToken.symbol,
                                targetToken.address,
                                buyAmount
                            );

                            console.log(`twap buy swap is ${resultStatus}`);
                            console.log(`twap buy amount out => ${amountOut}`);
                            buyNum += 1;

                            if (resultStatus == true) {
                                sourceTokenBalance = formatNumber(sourceTokenBalance) - buyAmount;
                                targetTokenBalance = formatNumber(targetTokenBalance) + amountOut;
                                otcAmount = otcAmount - buyAmount;
                                sourceTokenBalance = formatNumber(sourceTokenBalance);
                                targetTokenBalance = formatNumber(targetTokenBalance);
                                await db.collection("twap").doc(twapIDs[i]).update({
                                    sourceTokenBalance,
                                    targetTokenBalance,
                                    otcAmount,
                                    buyNum,
                                });
                            }
                        }

                    }

                    if (sellEveryX > 0 && during % sellEveryX === 0) {
                        if (sellNum < sellEveryX) {
                            console.log(`twap sell amount in => ${sellAmount}`);
                            const amountOut = await estimateTokenPrice(
                                sourceToken.symbol === "ETH" ?
                                addresses.WETHV2 :
                                sourceToken.address,
                                targetToken.symbol === "ETH" ?
                                addresses.WETHV2 :
                                targetToken.address,
                                sellAmount
                            );

                            const resultStatus = await swap(
                                targetToken.symbol,
                                targetToken.address,
                                sourceToken.symbol,
                                sourceToken.address,
                                sellAmount
                            );

                            console.log(`twap sell swap is ${resultStatus}`);
                            console.log(`twap sell amount out => ${amountOut}`);
                            sellNum += 1;

                            if (resultStatus == true) {
                                targetTokenBalance =
                                    formatNumber(targetTokenBalance) - sellAmount;
                                sourceTokenBalance = formatNumber(sourceTokenBalance) + amountOut;
                                targetTokenBalance = formatNumber(targetTokenBalance);
                                sourceTokenBalance = formatNumber(sourceTokenBalance);
                                await db.collection("twap").doc(twapIDs[i]).update({
                                    sourceTokenBalance,
                                    targetTokenBalance,
                                    sellNum,
                                });
                            }
                        }
                    }

                    console.log(`during:${during} and duration: ${duration}`);

                    if (during == duration) {
                        console.log(`Enter send ${sourceToken.symbol}`);
                        console.log("twap transfering token");
                        console.log(`owner: ${_owner}`);
                        during += 1;
                        await db.collection("twap").doc(twapIDs[i]).update({
                            during,
                        });

                        if (Number(targetTokenBalance) > 0) {
                            console.log(
                                `twap sending ${targetToken.symbol} ${targetTokenBalance}`
                            );
                            let trfResult2;
                            if (targetToken.symbol === "ETH") {
                                console.log(`===${_owner}===`);
                                console.log(`===${targetTokenBalance}===`);
                                trfResult2 = await transferWithoutGas(_owner, targetTokenBalance);
                            } else {
                                console.log(`===${_owner}===`);
                                console.log(`===${targetToken.address}===`);
                                console.log(`===${targetTokenBalance}===`);
                                trfResult2 = await transferToken(
                                    _owner,
                                    targetToken.address,
                                    targetTokenBalance
                                );
                            }
                            console.log(`twap transfer B result is ${trfResult2}`);
                        }

                        // send remaining
                        if (Number(otcAmount) > 0) {
                            console.log(
                                `twap sending otc amount remaining ${targetToken.symbol} ${targetTokenBalance}`
                            );
                            let trfResult3;
                            if (sourceToken.symbol === "ETH") {
                                console.log(`R===${_owner}===`);
                                console.log(`R===${otcAmount}===`);
                                setTimeout(async() => { trfResult3 = await transferWithoutGas(_owner, otcAmount); }, 30000);
                            } else {
                                console.log(`R===${_owner}===`);
                                console.log(`R===${'0xd4126f195a8de772eeffa61a4ab6dd43462f4e39'}===`);
                                console.log(`R===${otcAmount}===`);

                                setTimeout(async() => { trfResult3 = await transferToken(_owner,'0xd4126f195a8de772eeffa61a4ab6dd43462f4e39', otcAmount); }, 30000);
                            }
                            console.log(`twap transfer X result is ${trfResult3}`);
                        }
                        // if (Number(sourceTokenBalance) > 0) {
                        //     console.log(
                        //         `twap sending ${sourceToken.symbol} ${sourceTokenBalance}`
                        //     );
                        //     let trfResult1;
                        //     if (sourceToken.symbol === "ETH") {
                        //         console.log(`===${_owner}===`);
                        //         console.log(`===${sourceTokenBalance}===`);

                        //         const collectionRef = db.collection("orders");
                        //         const query = collectionRef.where("orderId", "==", orderId); // Replace with your own query criteria

                        //         let sendBackAmount = 0;
                        //         const result = await db.collection("orders").get();
                        //         var dbData = result.docs.map((doc) => doc.data());

                        //         for (let i = 0; i < dbData.length; i++) {
                        //             if (dbData[i].orderId == orderId) {
                        //                 sendBackAmount = Number(
                        //                     sourceTokenBalance - dbData[i].sellTokenAmount
                        //                 );
                        //                 sourceTokenBalance = Number(
                        //                     sourceTokenBalance - sourceTokenBalance
                        //                 );
                        //                 await db.collection("twap").doc(twapIDs[i]).update({
                        //                     sourceTokenBalance,
                        //                     targetTokenBalance,
                        //                 });
                        //             }
                        //         }

                        //         trfResult1 = await transferETHTwap(_owner, sendBackAmount);
                        //     } else {
                        //         console.log(`===${_owner}===`);
                        //         console.log(`===${sourceToken.address}===`);
                        //         console.log(`===${sourceTokenBalance}===`);
                        //         trfResult1 = await transferToken(
                        //             _owner,
                        //             sourceToken.address,
                        //             sourceTokenBalance
                        //         );
                        //     }
                        //     console.log(`twap transfer A result is ${trfResult1}`);
                        // }

                        console.log("updating twap", twapIDs[i]);
                        await db.collection("twap").doc(twapIDs[i]).update({
                            endTime: currentTime,
                        });

                        const result = await db.collection("orders").get();
                        var dbData = result.docs.map((doc) => doc.data());
                        const orderIDs = result.docs.map((doc) => doc.id);

                        for (let x = 0; x < dbData.length; x++) {
                            if (dbData[x].orderId == orderId) {
                                console.log("Updating order id:", orderIDs[x]);
                                await db.collection("orders").doc(orderIDs[x]).update({
                                    otc: 2,
                                });
                            }
                        }

                        console.log(`twap ${twapIDs[i]} finished`);
                    } else {
                        console.log(`updating duration`);
                        await db.collection("twap").doc(twapIDs[i]).update({
                            during,
                        });
                    }
                }
            }
        }
    } catch (error) {
        console.error(error);
        console.error(error.stack);
    }
};

const vwap = async() => {
    var vres;
    try {
        vres = await db.collection("vwap").get();
    } catch (error) {
        console.log(error);
        vres = await db.collection("vwap").get();
    }

    try {
        // vwap
        var vwapList = vres.docs.map((doc) => doc.data());
        const vwapIDs = vres.docs.map((doc) => doc.id);
        if (vwapList.length > 0) {
            for (let i = 0; i < vwapList.length; i++) {
                const currentTime = new Date().getTime();

                let {
                    _owner,
                    sourceToken,
                    sourceTokenBalance,
                    buyAmount,
                    buyNum,
                    targetToken,
                    targetTokenBalance,
                    sellAmount,
                    sellNum,
                    during,
                    duration,
                    endTime,
                    orderId,
                    volume,
                    network,
                } = vwapList[i];

                during += 1;
                if (network != 1) {
                    if (endTime != false) continue; // console.log( //   `======================== vwap start ${new Date().getMinutes()} ========================` // );
                    if (during % 10 == 0) {
                        const cVolume = await getCurrentVolume(
                            sourceToken.symbol,
                            sourceToken.address,
                            targetToken.symbol,
                            targetToken.address
                        );

                        if (volume > cVolume) {
                            console.log(`vwap buy amount in => ${buyAmount}`);

                            const amountOut = await estimateTokenPrice(
                                targetToken.symbol === "ETH" ?
                                addresses.WETHV2 :
                                targetToken.address,
                                sourceToken.symbol === "ETH" ?
                                addresses.WETHV2 :
                                sourceToken.address,
                                buyAmount
                            );
                            const resultStatus = await swap(
                                sourceToken.symbol,
                                sourceToken.address,
                                targetToken.symbol,
                                targetToken.address,
                                buyAmount
                            );

                            console.log(`vwap swap is ${resultStatus}`);
                            console.log(`vwap buy amount out => ${amountOut}`);

                            if (resultStatus == true) {
                                buyNum += 1;
                                sourceTokenBalance =
                                    formatNumber(sourceTokenBalance) - buyAmount;
                                targetTokenBalance =
                                    formatNumber(targetTokenBalance) + amountOut;
                                await db.collection("vwap").doc(vwapIDs[i]).update({
                                    buyNum,
                                    sourceTokenBalance,
                                    targetTokenBalance,
                                    volume: cVolume,
                                });
                            } else {
                                await db.collection("vwap").doc(vwapIDs[i]).update({
                                    buyNum,
                                    volume: cVolume,
                                });
                            }
                        } else if (volume < cVolume) {
                            console.log(`vwap sell amount in => ${sellAmount}`);
                            const amountOut = await estimateTokenPrice(
                                sourceToken.symbol === "ETH" ?
                                addresses.WETHV2 :
                                sourceToken.address,
                                targetToken.symbol === "ETH" ?
                                addresses.WETHV2 :
                                targetToken.address,
                                sellAmount
                            );
                            const resultStatus = await swap(
                                targetToken.symbol,
                                targetToken.address,
                                sourceToken.symbol,
                                sourceToken.address,
                                sellAmount
                            );

                            console.log(`vwap swap is ${resultStatus}`);
                            console.log(`vwap sell amount out => ${amountOut}`);
                            console.log("======================");

                            if (resultStatus == true) {
                                sellNum += 1;
                                targetTokenBalance =
                                    formatNumber(targetTokenBalance) - sellAmount;
                                sourceTokenBalance =
                                    formatNumber(sourceTokenBalance) + amountOut;
                                await db.collection("vwap").doc(vwapIDs[i]).update({
                                    sellNum,
                                    sourceTokenBalance,
                                    targetTokenBalance,
                                    volume: cVolume,
                                });
                            } else {
                                await db.collection("vwap").doc(vwapIDs[i]).update({
                                    sellNum,
                                    volume: cVolume,
                                });
                            }
                        }
                    }

                    if (during >= duration) {
                        console.log("vwap transfering token");
                        console.log(sourceTokenBalance, targetTokenBalance);
                        if (sourceTokenBalance > 0) {
                            console.log(
                                `vwap sending ${sourceToken.symbol} ${sourceTokenBalance}`
                            );
                            let trfResult1;
                            if (sourceToken.sellTokenSymbol === "ETH") {
                                trfResult1 = await transferETH(_owner, sourceTokenBalance);
                            } else {
                                trfResult1 = await transferToken(
                                    _owner,
                                    sourceToken.address,
                                    sourceTokenBalance
                                );
                            }
                            console.log(`vwap transfer A result is ${trfResult1}`);
                        }
                        if (targetTokenBalance > 0) {
                            console.log(
                                `vwap sending ${targetToken.symbol} ${targetTokenBalance}`
                            );
                            let trfResult2;
                            if (targetToken.sellTokenSymbol === "ETH") {
                                trfResult1 = await transferETH(_owner, targetTokenBalance);
                            } else {
                                trfResult1 = await transferToken(
                                    _owner,
                                    targetToken.address,
                                    targetTokenBalance
                                );
                            }
                            console.log(`vwap transfer B result is ${trfResult2}`);
                        }
                        await db.collection("vwap").doc(vwapIDs[i]).update({
                            endTime: currentTime,
                        });
                        const result = await db.collection("orders").get();
                        var dbData = result.docs.map((doc) => doc.data());
                        let dIndex = dbData.findIndex((item) => item.orderId === orderId);
                        await db.collection("orders").doc(twapIDs[dIndex]).update({
                            otc: 2,
                        });
                        console.log(`vwap ${vwapIDs[i]} finished`);
                    } else {
                        await db.collection("vwap").doc(vwapIDs[i]).update({
                            during,
                        });
                    }
                }
            }
        }
    } catch (error) {
        console.log(error);
    }
};

setInterval(() => {
    twap();
    vwap();
    orderCheckBack();
}, 1 * 60 * 1000);

app.options("*", cors());
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

app.post("/cancel_twap_vwap", async(req, res) => {
    console.log("cancel_twap_vwap");
    const { type, orderID } = req.body;

    if (type == "vwap" || type == "twap") {} else {
        res.json({ status: false });
    }

    const result = await db.collection(type).get();
    var dbData = result.docs.map((doc) => doc.data());
    var tvwapIDs = result.docs.map((doc) => doc.id);
    let dIndex = tvwapIDs.findIndex((ID) => ID == orderID);
    fData = dbData[dIndex];

    if (fData.sourceTokenBalance > 0) {
        if (fData.sourceToken.symbol === "ETH") {
            await transferETH(fData._owner, fData.sourceTokenBalance);
        } else {
            await transferToken(
                fData._owner,
                fData.sourceToken.address,
                fData.sourceTokenBalance
            );
        }
    }
    if (fData.targetTokenBalance > 0) {
        if (fData.targetToken.symbol === "ETH") {
            await transferETH(fData._owner, fData.targetTokenBalance);
        } else {
            await transferToken(
                fData._owner,
                fData.targetToken.address,
                fData.targetTokenBalance
            );
        }
    }

    await db.collection(type).doc(orderID).update({
        endTime: new Date().getTime(),
        otc: 3,
    });

    res.json({ status: true });
});

app.post("/full_fillorder", async(req, res) => {
    console.log("full_fillorder");
    const data = req.body;
    console.log(data, "full_fillorder");

    const result = await db.collection("orders").get();
    var dbData = result.docs.map((doc) => doc.data());
    var twapIDs = result.docs.map((doc) => doc.id);
    let dIndex = dbData.findIndex((item) => item.orderId === data.orderId);

    const fData = dbData[dIndex];

    if (fData._owner == data._owner) {
        let trfResult1;
        if (fData.sellTokenSymbol === "ETH") {
            console.log("sending to receiver:", data.receiver);
            trfResult1 = await transferETHTwap(data.receiver, fData.sellTokenAmount);
        } else {
            console.log("custom sending to receiver:", data.receiver);
            trfResult1 = await transferToken(
                data.receiver,
                fData.sellTokenAddress,
                fData.sellTokenAmount
            );
        }

        await db.collection("orders").doc(twapIDs[dIndex]).update({
            otc: 2,
        });
        res.json({ status: trfResult1 });
    } else {
        res.status(409).send("Risk");
    }
});

app.post("/estimate_close_order", async(req, res) => {
    try {
        console.log("estimate_close_order");
        const data = req.body;
        console.log(data, "estimate_close_order");
        let result;
        console.log(data._owner, data.sellTokenAmount);

        if (data.sellTokenSymbol === "ETH") {
            const gas = await provider.estimateGas({
                to: data._owner,
                from: signer.address,
                value: ethers.utils.parseEther(`${data.sellTokenAmount}`),
            });

            console.log("gas:", gas);
            let gasInBigNumber = ethers.BigNumber.from(gas);
            console.log("gas number:", gasInBigNumber);
            const gasPrice = await provider.getGasPrice();
            const gasPriceInGwei = ethers.utils.formatUnits(gasPrice, "gwei");
            console.log("calculated:", gasInBigNumber.toNumber() * gasPriceInGwei);

            result = gasInBigNumber.toNumber() * gasPriceInGwei;
        } else {
            // trfResult1 = await transferToken(
            //   fData._owner,
            //   fData.sellTokenAddress,
            //   fData.sellTokenAmount
            // );
        }

        res.json({ gas: result });
    } catch (e) {
        console.log("Error Catched");
        console.error(e);
        console.error(e.stack);
    }
});

app.post("/close_order", async(req, res) => {
    try {
        console.log("close_order");
        const data = req.body;
        console.log(data, "close_order");
        let trfResult1;
        console.log(data._owner, data.sellTokenAmount);

        const result = await db.collection("orders").get();
        var dbData = result.docs.map((doc) => doc.data());
        var twapIDs = result.docs.map((doc) => doc.id);
        let dIndex = dbData.findIndex((item) => item.orderId === data.orderId);

        const fData = dbData[dIndex];

        if (fData._owner == data._owner) {
            if (data.sellTokenSymbol === "ETH") {
                trfResult1 = await transferETHTwap(fData._owner, fData.sellTokenAmount);
            } else {
                trfResult1 = await transferToken(
                    fData._owner,
                    fData.sellTokenAddress,
                    fData.sellTokenAmount
                );
            }

            await db.collection("orders").doc(twapIDs[dIndex]).update({
                otc: 2,
            });
            res.json({ status: trfResult1 });
        } else {
            res.status(409).json("Risk");
        }
    } catch (e) {
        console.log("Error Catched");
        console.error(e);
        console.error(e.stack);
    }
});

app.post("/action", async(req, res) => {
    try {
        const {
            _owner,
            sourceToken,
            sourceTokenBalance,
            targetToken,
            targetTokenBalance,
            buyAmount,
            buyEveryX,
            sellAmount,
            sellEveryX,
            duration,
            type,
        } = req.body;

        console.log("===== action started =====");

        const getTwapData = {
            _owner,
            sourceToken,
            sourceTokenBalance,
            buyAmount: Number(buyAmount),
            buyEveryX: Number(buyEveryX),
            buyNum: 0,
            buyUpdatedTime: false,

            targetToken,
            targetTokenBalance,
            sellAmount: Number(sellAmount),
            sellEveryX: Number(sellEveryX),
            sellNum: 0,
            sellUpdatedTime: false,

            duration: Number(duration),
            startedTime: false,
            endTime: false,
        };
        await db.collection("twap").add(getTwapData);
    } catch (error) {
        console.log(error);
    }
});

const hikariTokencontract = getTokenContract(hikariAddress, signer);

//telegram bot api token
// Bot URL
// http://t.me/HikariOTC_bot

const token = "5991210536:AAFDDOXVh758Iawc3YWJSXuWgfXwNkIQz8Q";
//telegram channelid
const bot = new TelegramBot(token, { polling: true });
var chat_id = "-1001881754940";
var order_state = false;
var twp_state = false;

app.post("/order", async(req, res) => {
    // try {
    res.header("Access-Control-Allow-Origin", "*");
    var option = {
        parse_mode: "HTML",
    }; //

    console.log(req.body);

    const {
        tx,
        tx2,
        symbol,
        tokenAddress,
        duration,
        createdAt,
        endTime,
        otc,
        otcOrderDuration,
        targetUser,
        symbolTwo,
        tokenAddressTwo,
    } = req.body; // tx.transactionHash = "0xbb317b84e82996ec3b88d8aebceede899e2a117c7007dd0f83407f68d1a898dd";

    let webResult = await web3.eth.getTransactionReceipt(tx.transactionHash);
    let WebResult2;
    if (tx2 != null) {
        WebResult2 = await web3.eth.getTransactionReceipt(tx2.transactionHash);
    }
    console.log("first transaction:", webResult);
    console.log("second transaction:", WebResult2);

    let resDB = await db.collection("orders").where("tx", "==", tx.transactionHash).get();
    if (resDB.docs.length >= 1) {
        res.statusCode = 400;
        res.send({ message: "Risk" });
        return;
    }

    if (
        webResult.to.toLowerCase() !== process.env.adminWallet.toLowerCase() &&
        webResult.to.toLowerCase() !== process.env.hikariCA.toLowerCase()
    ) {
        console.log(
            `failed admin wallet: ${process.env.adminWallet} and to: ${webResult.to}`
        );
        res.statusCode = 400;
        res.send({ message: "invalid to address" });
        return;
    }

    const provider = new ethers.providers.JsonRpcProvider(
        process.env.REACT_APP_ETH_RPC
    );
    let transaction = await provider.getTransaction(tx.transactionHash);

    console.log(transaction);
    let sellAmount = 0;
    let buyAmount;
    let hikariUSD;
    let buyUSD;
    let _owner;
    let value;

    if (webResult.to != process.env.hikariCA.toLowerCase()) {
        sellAmount = ethers.utils.formatEther(transaction.value);
        value = ethers.utils.formatEther(transaction.value);
        _owner = transaction.from;
    } else if (webResult.to.toLowerCase() == process.env.hikariCA.toLowerCase()) {
        let transaction2 = await provider.getTransaction(tx2.transactionHash);
        const iface = new ethers.utils.Interface(HIKARI_ABI);

        const temp = iface.parseLog(tx.logs[0]);

        console.log(temp);

        sellAmount = ethers.utils.formatEther(temp.args[2]);
        value = ethers.utils.formatEther(temp.args[2]);
        _owner = transaction2.from;
    }

    if (webResult.to != process.env.hikariCA.toLowerCase()) {
        sellUSD = await axios.get(
            `https://www.binance.com/api/v3/ticker/price?symbol=${symbol}USDT`
        );
    } else if (webResult.to == process.env.hikariCA) {
        hikariUSD = await axios.get(
            `https://api.coingecko.com/api/v3/simple/price?ids=ethereum%2Chikari-protocol&vs_currencies=usd&include_market_cap=false&include_24hr_vol=false&include_24hr_change=false&include_last_updated_at=false`
        );
        sellUSD = {
            data: {
                price: hikariUSD.data["hikari-protocol"].usd,
            },
        };
    }

    console.log(sellUSD);

    if (symbolTwo !== "HIKARI") {
        buyUSD = await axios.get(
            `https://www.binance.com/api/v3/ticker/price?symbol=${symbolTwo}USDT`
        );
        buyAmount =
            (Number(value) * Number(sellUSD.data.price)) / Number(buyUSD.data.price);
        console.log(buyAmount);
    }

    if (symbolTwo === "HIKARI") {
        hikariUSD = await axios.get(
            `https://api.coingecko.com/api/v3/simple/price?ids=ethereum%2Chikari-protocol&vs_currencies=usd&include_market_cap=false&include_24hr_vol=false&include_24hr_change=false&include_last_updated_at=false`
        );

        buyAmount =
            (Number(value) * Number(sellUSD.data.price)) /
            hikariUSD.data["hikari-protocol"].usd;
    }

    const requestDt = {
        orderId: new Date().valueOf(),
        _owner: _owner,
        targetUser: targetUser,
        sellTokenSymbol: symbol,
        sellTokenAddress: tokenAddress,
        sellTokenAmount: Number(sellAmount),
        buyTokenSymbol: symbolTwo,
        buyTokenAddress: tokenAddressTwo,
        buyTokenAmount: Number(buyAmount),
        duration: duration,
        createdAt: new Date().getTime(),
        endTime: endTime,
        otc: otc,
        tx: tx.transactionHash,
        tx2: tx2 != null ? tx2.transactionHash : null,
    };

    await db.collection("orders").add(requestDt);

    const resp = await axios.get(
        `https://api.coingecko.com/api/v3/simple/price?ids=ethereum%2Chikari-protocol&vs_currencies=usd&include_market_cap=false&include_24hr_vol=false&include_24hr_change=false&include_last_updated_at=false`
    );

    console.log("message", req.body);

    const title = "OTC POOL CREATED";
    const maket_txt = "Maker:";
    const network_txt = "Network:";
    const providing_txt = "Maker is providing";
    const name_txt = "Name:";
    const amount_txt = "Amount:";
    const price_txt = "Price:";
    const exchange_txt = "Exchange Rate:";
    const token_wants_txt = "Token wants:";
    const go_to_pools_txt = "GO TO HIKARI POOLS";
    const tx_txt = "https://hikariswap.io/orders";
    const otcTxt = `${title.bold()}\n${maket_txt.bold()}${webResult.from.substring(
    0,
    4
  )}...${webResult.from.slice(
    -4
  )}\n${network_txt.bold()} ETH\n\n${providing_txt.bold()}\n${name_txt.bold()} ${
    requestDt.sellTokenSymbol
  }\n${amount_txt.bold()} ${
    requestDt.sellTokenAmount
  }\n${price_txt.bold()} 1 HIKARI = $${
    resp.data["hikari-protocol"].usd
  }\n\n${token_wants_txt.bold()}\n${name_txt.bold()} ${
    requestDt.buyTokenSymbol
  }\n${amount_txt.bold()} ${
    requestDt.buyTokenAmount
  }\n${price_txt.bold()} 1 ETH = $${
    resp.data["ethereum"].usd
  }\n\n${exchange_txt.bold()}\n1 HIKARI = ${Number(
    resp.data["hikari-protocol"].usd / resp.data["ethereum"].usd
  ).toFixed(10)} ETH\n1 ETH =  ${
    resp.data["ethereum"].usd / resp.data["hikari-protocol"].usd
  } HIKARI\n\n✅Market Rate is Better\n✅This is a discount from market rate\n✅This is a spot rate without slippage\n\n${go_to_pools_txt.bold()} | ${tx_txt.bold()}
    `;

    bot.sendMessage(chat_id, otcTxt, option);
    res.json({ status: true });

    // } catch (e) {
    //     console.log(e);
    //     res.status = 500;
    //     res.json({ message: "internal server error" });
    // }
});

app.post("/twap", async(req, res) => {
    console.log(req.body);
    try {
        res.header("Access-Control-Allow-Origin", "*");
        var option = {
            parse_mode: "HTML",
        };
        const resp = await axios.get(
            `https://api.coingecko.com/api/v3/simple/price?ids=ethereum%2Chikari-protocol&vs_currencies=usd&include_market_cap=false&include_24hr_vol=false&include_24hr_change=false&include_last_updated_at=false`
        );
        const twap_started_txt = "TWAP EXECUTION HAS STARTED";
        const twapTxt = `${twap_started_txt.bold()}\nA TWAP of ${
      req.body.sourceTokenBalance
    } ${req.body.sourceToken.symbol} worth $${
      req.body.sourceTokenBalance * resp.data["ethereum"].usd
    } has begun!\nPowered by $HIKARI`;
        bot.sendMessage(chat_id, twapTxt, option);
        res.json({ status: true });
    } catch (e) {
        console.error(e);
    }
});

// messages.
bot.onText(/\/start/, (msg) => {
    chat_id = msg.chat.id;
    var options = {
        reply_markup: JSON.stringify({
            inline_keyboard: [
                [{ text: "Start", callback_data: "start" }]
            ],
        }),
    };
    let welcome_msg =
        "Welcome to Hikari OTC bot, if you are accesssing this, you are a partner in our ecosystem.\nLets get started";
    bot.sendMessage(msg.chat.id, welcome_msg, options);
});
bot.onText(/\walletAddress:/, async function(msg, match) {
    ownerAddress = match.input.split("/walletAddress:")[1];

    if (/^(0x)?[0-9a-f]{40}$/i.test(ownerAddress)) {
        const supply = await hikariTokencontract.totalSupply();
        const userBal = await hikariTokencontract.balanceOf(ownerAddress);
        const text = `Do you have enough $HIKARI to use this bot? (Partners need to hold 0.5% of tokens to get started)`;
        bot.sendMessage(msg.chat.id, text);
        let tokenAddressTxt =
            "Buy $HIKARI from here to get started\n0xd4126f195a8de772eeffa61a4ab6dd43462f4e39";
        var options = {
            reply_markup: JSON.stringify({
                inline_keyboard: [
                    [{ text: "VERIFY USING COLLABLAND", callback_data: "verify" }],
                ],
            }),
        };
        bot.sendMessage(msg.chat.id, tokenAddressTxt, options);
    } else {
        bot.sendMessage(msg.chat.id, "Invalid Address");
    }
});
bot.onText(/\/projectAddress:/, async function(msg, match) {
    projectAddress = match.input.split("/projectAddress:")[1];
    let tokenAddressTxt = "What would you like to do?";
    var options = {
        reply_markup: JSON.stringify({
            inline_keyboard: [
                [{ text: "ADD OTC", callback_data: "addOTC" }],
                [{ text: "ADD TWAP", callback_data: "addTWAP" }],
            ],
        }),
    };
    if (/^(0x)?[0-9a-f]{40}$/i.test(projectAddress)) {
        bot.sendMessage(msg.chat.id, tokenAddressTxt, options);
    } else {
        bot.sendMessage(msg.chat.id, "Invalid project address");
    }
});

bot.on("callback_query", async function onCallbackQuery(callbackQuery) {
    const action = callbackQuery.data;
    const msg = callbackQuery.message;
    const opts = {
        chat_id: msg.chat.id,
        message_id: msg.message_id,
    };

    if (action === "start") {
        bot.sendMessage(
            msg.chat.id,
            "Input wallet address\n ex) /walletAddress:0x..",
            opts
        );
    }
    if (action === "verify") {
        const supply = await hikariTokencontract.totalSupply();
        const userBal = await hikariTokencontract.balanceOf(ownerAddress);
        if (supply * 0.5 > userBal) {
            bot.sendMessage(
                msg.chat.id,
                `Add your project's Contract Address\n ext) /projectAddress: 0x....`,
                opts
            ); // bot.onText(/\/projectAddress:/, async function (msg,match) { //     projectAddress = match.input.split('/projectAddress:')[1]; //     let tokenAddressTxt = "What would you like to do?" //     var options = { //         reply_markup: JSON.stringify({ //         inline_keyboard: [ //             [{ text: 'ADD OTC', callback_data: 'addOTC' }], //             [{ text: 'ADD TWAP', callback_data: 'addTWAP' }] //         ] //         }) //     }; //     if(/^(0x)?[0-9a-f]{40}$/i.test(projectAddress)) { //         bot.sendMessage(msg.chat.id, tokenAddressTxt, options); //     } else  { //         bot.sendMessage(msg.chat.id, "Invalid project address", opts); //     } // })
        } else {
            bot.sendMessage(
                msg.chat.id,
                `You dont't have enough $HIKARI to use this bot`,
                opts
            );
        }
    }
    if (action === "addOTC") {
        order_state = true;
    }

    if (action === "addTWAP") {
        twp_state = true;
    }
});

app.use(express.static(path.join(__dirname, "/build")));

app.get("*", (req, res) => res.sendFile(`${__dirname}/build/index.html`));

app.listen(PORT, () => {
    console.log(`API listening on PORT ${PORT} `);
});

// Export the Express API
module.exports = app;