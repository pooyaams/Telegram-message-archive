require("dotenv").config();

const fs = require("fs");
const path = require("path");

const connectDatabase = require("./services/database");
const client = require("./telegram/client");
const startMessageListener = require("./telegram/messageListener");
const findChats = require("./telegram/findChat");
const startDeleteListener =
    require("./telegram/deleteListener");

function ask(question) {
    const readline = require("readline");

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer.trim());
        });
    });
}

function saveSessionToEnv(session) {
    const envPath = path.resolve(".env");

    let envContent = fs.readFileSync(envPath, "utf8");

    const sessionLine = `TELEGRAM_SESSION=${session}`;

    if (envContent.match(/^TELEGRAM_SESSION=.*$/m)) {
        envContent = envContent.replace(
            /^TELEGRAM_SESSION=.*$/m,
            sessionLine
        );
    } else {
        envContent += `\n${sessionLine}\n`;
    }

    fs.writeFileSync(envPath, envContent);

    console.log("Telegram session saved to .env");
}

async function loginToTelegram() {
    if (process.env.TELEGRAM_SESSION) {
        console.log("Telegram session found.");
        console.log("Connecting with existing session...");

        await client.connect();

        return;
    }

    console.log("No Telegram session found.");
    console.log("Starting Telegram login...");

    await client.start({
        phoneNumber: async () => {
            return await ask("Phone number: ");
        },

        phoneCode: async () => {
            return await ask("Telegram code: ");
        },

        password: async () => {
            return await ask("2FA password: ");
        },

        onError: (error) => {
            console.error("Telegram login error:", error);
        },
    });

    const session = client.session.save();

    saveSessionToEnv(session);
}

async function main() {
    await connectDatabase();

    await loginToTelegram();

    console.log("Telegram connected!");

    // await findChats(client);

    startMessageListener(client);

    startDeleteListener(client);

    console.log("Message listener started.");

    // برنامه را باز نگه می‌داریم
    await new Promise(() => {});
}

main().catch((error) => {
    console.error("Application error:", error);
});