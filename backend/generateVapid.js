import webpush from "web-push";

const keys = webpush.generateVAPIDKeys();

console.log("PUBLIC KEY:\n", keys.publicKey);
console.log("PRIVATE KEY:\n", keys.privateKey);
