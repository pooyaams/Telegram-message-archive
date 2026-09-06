const { Raw } = require("telegram/events");
const { Api } = require("telegram");
const { CustomFile } = require("telegram/client/uploads");

const Message = require("../models/message");

const {
    downloadFromB2,
} = require("../services/b2");


/*
 * Message IDs that were deleted before
 * they could be archived.
 */

const pendingDeletedMessages =
    new Set();


/*
 * --------------------------------
 * Start delete listener
 * --------------------------------
 */

function startDeleteListener(client) {

    client.addEventHandler(

        async (update) => {

            try {

                if (
                    update instanceof
                    Api.UpdateDeleteMessages
                ) {

                    console.log(
                        "PRIVATE MESSAGE DELETE:"
                    );


                    console.log({

                        messageIds:
                        update.messages,

                        pts:
                        update.pts,

                        ptsCount:
                        update.ptsCount,
                    });


                    for (
                        const messageId of
                        update.messages
                        ) {

                        await handleDeletedMessage(
                            client,
                            messageId
                        );
                    }
                }

            } catch (error) {

                console.error(
                    "Delete listener error:"
                );

                console.error(error);
            }
        },

        new Raw({

            types: [
                Api.UpdateDeleteMessages,
            ],

        })
    );
}


/*
 * --------------------------------
 * Handle deleted message
 * --------------------------------
 */

async function handleDeletedMessage(
    client,
    messageId
) {

    try {

        const message =
            await Message.findOneAndUpdate(

                {
                    telegramMessageId:
                    messageId,

                    deleted:
                        false,
                },

                {
                    $set: {
                        deleted:
                            true,
                    },
                },

                {
                    returnDocument:
                        "after",
                }
            );


        /*
         * Message isn't in MongoDB yet.
         */

        if (!message) {

            console.log(
                "Deleted message not found in database. Adding to pending:",
                messageId
            );


            pendingDeletedMessages.add(
                messageId
            );


            return;
        }


        console.log(
            "Message marked as deleted:"
        );


        console.log({

            telegramMessageId:
            message.telegramMessageId,

            chatId:
            message.chatId,

            mongoId:
            message._id,

            deleted:
            message.deleted,
        });


        /*
         * Media exists but B2 upload
         * hasn't finished yet.
         */

        if (
            message.media?.type &&
            !message.media?.storageKey
        ) {

            console.log(
                "Media is not ready yet. Adding message to pending archive:",
                messageId
            );


            pendingDeletedMessages.add(
                messageId
            );


            return;
        }


        /*
         * Archive immediately.
         */

        await archiveDeletedMessage(
            client,
            message
        );

    } catch (error) {

        console.error(
            "Failed to handle deleted message:",
            messageId
        );

        console.error(error);
    }
}


/*
 * --------------------------------
 * Check pending deleted message
 * --------------------------------
 */

async function checkPendingDeletedMessage(
    client,
    message
) {

    const messageId =
        message.telegramMessageId;


    if (
        !pendingDeletedMessages.has(
            messageId
        )
    ) {
        return;
    }


    console.log(
        "Found pending deleted message:",
        messageId
    );


    try {

        /*
         * Get latest version from MongoDB.
         */

        let deletedMessage =
            await Message.findById(
                message._id
            );


        if (!deletedMessage) {

            console.log(
                "Pending message no longer exists:",
                messageId
            );

            return;
        }


        /*
         * Make sure deleted=true.
         */

        if (!deletedMessage.deleted) {

            deletedMessage =
                await Message.findOneAndUpdate(

                    {
                        _id:
                        message._id,

                        deleted:
                            false,
                    },

                    {
                        $set: {
                            deleted:
                                true,
                        },
                    },

                    {
                        returnDocument:
                            "after",
                    }
                );
        }


        if (!deletedMessage) {

            console.log(
                "Could not mark pending message as deleted:",
                messageId
            );

            return;
        }


        /*
         * Media is still not ready.
         */

        if (
            deletedMessage.media?.type &&
            !deletedMessage.media?.storageKey
        ) {

            console.log(
                "Pending deleted media is still not ready:",
                messageId
            );

            return;
        }


        /*
         * Archive.
         */

        await archiveDeletedMessage(
            client,
            deletedMessage
        );


        /*
         * Remove from pending only
         * after successful archive.
         */

        pendingDeletedMessages.delete(
            messageId
        );

    } catch (error) {

        console.error(
            "Failed to process pending deleted message:",
            messageId
        );

        console.error(error);
    }
}


/*
 * --------------------------------
 * Get archive filename
 * --------------------------------
 */

function getArchiveFileName(message) {

    const messageId =
        message.telegramMessageId;


    /*
     * Photo
     */

    if (
        message.media?.type ===
        "photo"
    ) {

        return `photo_${messageId}.jpg`;
    }


    /*
     * Video
     */

    if (
        message.media?.type ===
        "video"
    ) {

        const mimeType =
            message.media?.mimeType ||
            "";


        if (
            mimeType ===
            "video/webm"
        ) {

            return `video_${messageId}.webm`;
        }


        return `video_${messageId}.mp4`;
    }


    /*
     * Voice
     */

    if (
        message.media?.type ===
        "voice"
    ) {

        return `voice_${messageId}.ogg`;
    }


    /*
     * Fallback
     */

    return `file_${messageId}`;
}


/*
 * --------------------------------
 * Archive deleted message
 * --------------------------------
 */

async function archiveDeletedMessage(
    client,
    message
) {

    /*
     * Already archived.
     */

    if (message.archived) {

        console.log(
            "Message already archived:",
            message.telegramMessageId
        );

        return;
    }


    /*
     * --------------------------------
     * Sender
     * --------------------------------
     */

    const senderName =
        [
            message.senderFirstName,
            message.senderLastName,
        ]
            .filter(Boolean)
            .join(" ") ||
        "Unknown";


    const username =
        message.senderUsername
            ? `@${message.senderUsername}`
            : "-";


    /*
     * --------------------------------
     * Tehran date
     * --------------------------------
     */

    const date =
        message.date.toLocaleString(
            "fa-IR",
            {
                timeZone:
                    "Asia/Tehran",
            }
        );


    /*
     * --------------------------------
     * Caption
     * --------------------------------
     */

    const archiveCaption =
        `🗑️ Deleted Message\n\n` +

        `👤 ${senderName}\n` +

        `Username: ${username}\n` +

        `Chat ID: ${message.chatId}\n` +

        `Message ID: ${message.telegramMessageId}\n` +

        `Date: ${date}\n\n` +

        `💬 Message:\n${message.text || "-"}`;


    /*
     * --------------------------------
     * Archive group
     * --------------------------------
     */

    const archiveChat =
        new Api.InputPeerChat({

            chatId:
                BigInt(
                    process.env.ARCHIVE_CHAT_ID
                ),
        });


    let archiveMessage;


    /*
     * --------------------------------
     * Media
     * --------------------------------
     */

    if (
        message.media?.type &&
        message.media?.storageKey
    ) {

        console.log(
            "Deleted message contains media:"
        );


        console.log({

            type:
            message.media.type,

            storageKey:
            message.media.storageKey,

            mimeType:
            message.media.mimeType,
        });


        /*
         * Download from B2.
         */

        const fileBuffer =
            await downloadFromB2(
                message.media.storageKey
            );


        console.log(
            "Media downloaded from B2:"
        );


        console.log({

            size:
            fileBuffer.length,
        });


        /*
         * Get filename.
         */

        const fileName =
            getArchiveFileName(
                message
            );


        console.log(
            "Archive filename:",
            fileName
        );


        /*
         * --------------------------------
         * IMPORTANT:
         *
         * Wrap Buffer in CustomFile.
         *
         * GramJS uses CustomFile.name
         * as the actual filename.
         * --------------------------------
         */

        const customFile =
            new CustomFile(

                fileName,

                fileBuffer.length,

                "",

                fileBuffer
            );


        /*
         * Send to Telegram.
         */

        archiveMessage =
            await client.sendFile(

                archiveChat,

                {

                    file:
                    customFile,

                    caption:
                    archiveCaption,
                }
            );


        console.log(
            "Media archived successfully."
        );


    } else {

        /*
         * --------------------------------
         * Text message
         * --------------------------------
         */

        archiveMessage =
            await client.sendMessage(

                archiveChat,

                {
                    message:
                    archiveCaption,
                }
            );


        console.log(
            "Text message archived successfully."
        );
    }


    /*
     * --------------------------------
     * Mark as archived
     * --------------------------------
     */

    await Message.updateOne(

        {
            _id:
            message._id,
        },

        {
            $set: {

                archived:
                    true,

                archivedAt:
                    new Date(),

                archiveMessageId:
                archiveMessage.id,
            },
        }
    );


    console.log(
        "Deleted message archived successfully:"
    );


    console.log({

        messageId:
        message.telegramMessageId,

        archiveMessageId:
        archiveMessage.id,
    });
}


/*
 * --------------------------------
 * Exports
 * --------------------------------
 */

module.exports =
    startDeleteListener;


module.exports.checkPendingDeletedMessage =
    checkPendingDeletedMessage;


module.exports.archiveDeletedMessage =
    archiveDeletedMessage;