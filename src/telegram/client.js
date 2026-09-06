const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");

const apiId = Number(process.env.API_ID);
const apiHash = process.env.API_HASH;

const stringSession = new StringSession(
    process.env.TELEGRAM_SESSION || ""
);

const client = new TelegramClient(
    stringSession,
    apiId,
    apiHash,
    {
        connectionRetries: 5,
    }
);

module.exports = client;