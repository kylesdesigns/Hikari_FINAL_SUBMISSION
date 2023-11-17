const { encrypt } = require("./utils");

const adminWallet = "privatekey";
const encryptedWallet = encrypt(adminWallet);

console.log(encryptedWallet);