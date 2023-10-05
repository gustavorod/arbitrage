const crypto = require('crypto');

const query_string = 'coin=BTC&address=1BnCEv3iwDEaV4qKYnRBRLX3uQGzvq31Jt&amount=0.0001&timestamp=1682681290066';
const apiSecret = 'ieUUyURJdCaIuTnzsAE907gul5G9K3Trdosv1nOErxYjua7qzFwkPA0Lg2m8UC2q';

function signature(query_string) {
    return crypto
        .createHmac('sha256', apiSecret)
        .update(query_string)
        .digest('hex');
}

console.log("hashing the string: ");
console.log(query_string);
console.log("and return:");
console.log(signature(query_string));

console.log("\n");

const another_query = 'symbol=LTCBTC&side=BUY&type=LIMIT&timeInForce=GTC&quantity=1&price=0.1&recvWindow=5000&timestamp=1499827319559';
console.log("hashing the string: ");
console.log(another_query);
console.log("and return:");
console.log(signature(another_query));