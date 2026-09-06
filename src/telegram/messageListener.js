const { NewMessage } = require("telegram/events");

const Message = require("../models/message");
const { uploadToB2 } = require("../services/b2");

const {
    checkPendingDeletedMessage,
    archiveDeletedMessage,
} = require("./deleteListener");


function getMediaType(message) {
    if (!message.media) {
        return null;
    }

    if (message.photo) {
        return "photo";
    }

    if (message.document) {
        const mimeType =
            message.document.mimeType || "";

        if (mimeType === "audio/ogg") {
            return "voice";
        }

        if (mimeType.startsWith("video/")) {
            return "video";
        }
    }

    return null;
}


function getMimeType(message) {
    if (message.photo) {
        return "image/jpeg";
    }

    if (message.document) {
        return message.document.mimeType || null;
    }

    return null;
}


function getFileExtension(
    mediaType,
    mimeType
) {
    if (mediaType === "photo") {
        return "jpg";
    }

    if (mediaType === "voice") {
        return "ogg";
    }

    if (mediaType === "video") {
        if (mimeType === "video/mp4") {
            return "mp4";
        }

        if (mimeType === "video/webm") {
            return "webm";
        }

        return "mp4";
    }

    return "bin";
}


async function downloadMedia(
    client,
    message
) {
    if (!message.media) {
        return null;
    }

    try {
        const buffer =
            await client.downloadMedia(message);

        if (!buffer) {
            console.log(
                "Media download returned empty:",
                message.id
            );

            return null;
        }

        console.log(
            "Media downloaded:",
            {
                messageId: message.id,
                size: buffer.length,
            }
        );

        return buffer;

    } catch (error) {
        console.error(
            "Failed to download media:",
            message.id
        );

        console.error(error);

        return null;
    }
}


function startMessageListener(client) {

    client.addEventHandler(
        async (event) => {

            const message =
                event.message;


            /*
             * Ignore outgoing messages
             */

            if (message.out) {
                return;
            }


            /*
             * Only private chats
             */

            if (
                !message.peerId ||
                message.peerId.className !==
                "PeerUser"
            ) {
                return;
            }


            try {

                /*
                 * --------------------------------
                 * Get sender
                 * --------------------------------
                 */

                const sender =
                    await message.getSender();

                const senderId =
                    sender?.id?.toString();

                if (!senderId) {
                    console.log(
                        "Could not determine sender ID:",
                        message.id
                    );

                    return;
                }


                /*
                 * --------------------------------
                 * Ignore Saved Messages
                 * --------------------------------
                 */

                const me =
                    await client.getMe();

                if (
                    senderId ===
                    me.id.toString()
                ) {
                    return;
                }


                /*
                 * --------------------------------
                 * Basic information
                 * --------------------------------
                 */

                const chatId =
                    message.peerId.userId
                        .toString();

                const mediaType =
                    getMediaType(message);

                const mediaMimeType =
                    getMimeType(message);


                /*
                 * --------------------------------
                 * Save message to MongoDB FIRST
                 * --------------------------------
                 */

                let savedMessage;

                try {

                    savedMessage =
                        await Message.create({

                            telegramMessageId:
                            message.id,

                            chatId,

                            senderId,

                            senderUsername:
                                sender?.username ||
                                null,

                            senderFirstName:
                                sender?.firstName ||
                                null,

                            senderLastName:
                                sender?.lastName ||
                                null,

                            text:
                                message.message ||
                                "",

                            date:
                                new Date(
                                    message.date *
                                    1000
                                ),

                            media: {

                                type:
                                mediaType,

                                storageKey:
                                    null,

                                mimeType:
                                mediaMimeType,

                                size:
                                    null,

                                originalName:
                                    null,
                            },

                            deleted:
                                false,

                            archived:
                                false,

                            archivedAt:
                                null,

                            archiveMessageId:
                                null,
                        });


                    console.log(
                        "Message saved:",
                        savedMessage._id
                    );

                } catch (error) {

                    /*
                     * Duplicate message
                     */

                    if (
                        error.code === 11000
                    ) {

                        console.log(
                            "Message already exists:",
                            message.id
                        );

                        return;
                    }

                    throw error;
                }


                /*
                 * --------------------------------
                 * Download media + upload to B2
                 * --------------------------------
                 */

                if (mediaType) {

                    const mediaBuffer =
                        await downloadMedia(
                            client,
                            message
                        );


                    if (mediaBuffer) {

                        const extension =
                            getFileExtension(
                                mediaType,
                                mediaMimeType
                            );


                        const storageKey =
                            `messages/${chatId}/${message.id}.${extension}`;


                        /*
                         * Upload to B2
                         */

                        await uploadToB2({

                            buffer:
                            mediaBuffer,

                            key:
                            storageKey,

                            contentType:
                            mediaMimeType,
                        });


                        /*
                         * Save B2 information
                         * in MongoDB
                         */

                        await Message.updateOne(
                            {
                                _id:
                                savedMessage._id,
                            },

                            {
                                $set: {

                                    "media.storageKey":
                                    storageKey,

                                    "media.size":
                                    mediaBuffer.length,
                                },
                            }
                        );


                        console.log(
                            "Media information updated:"
                        );

                        console.log({

                            messageId:
                            message.id,

                            storageKey,

                            size:
                            mediaBuffer.length,
                        });
                    }
                }


                /*
                 * --------------------------------
                 * Handle pending deletion
                 * --------------------------------
                 *
                 * Important:
                 * This happens AFTER B2 upload.
                 */

                await checkPendingDeletedMessage(
                    client,
                    savedMessage
                );


                /*
                 * --------------------------------
                 * Check if message was deleted
                 * while being processed
                 * --------------------------------
                 */

                let latestMessage =
                    await Message.findById(
                        savedMessage._id
                    );


                if (
                    latestMessage?.deleted &&
                    !latestMessage?.archived
                ) {

                    console.log(
                        "Message was deleted during processing:",
                        message.id
                    );


                    await archiveDeletedMessage(
                        client,
                        latestMessage
                    );
                }


                /*
                 * --------------------------------
                 * Final state
                 * --------------------------------
                 */

                latestMessage =
                    await Message.findById(
                        savedMessage._id
                    );


                console.log(
                    "New message processing completed:"
                );


                console.log({

                    id:
                    message.id,

                    chatId,

                    senderId,

                    senderUsername:
                        sender?.username ||
                        null,

                    senderFirstName:
                        sender?.firstName ||
                        null,

                    senderLastName:
                        sender?.lastName ||
                        null,

                    text:
                        message.message ||
                        "",

                    mediaType,

                    mediaStorageKey:
                        latestMessage?.media
                            ?.storageKey ||
                        null,

                    mediaMimeType,

                    mediaSize:
                        latestMessage?.media
                            ?.size ||
                        null,

                    deleted:
                        latestMessage?.deleted ||
                        false,

                    archived:
                        latestMessage?.archived ||
                        false,

                    date:
                        new Date(
                            message.date *
                            1000
                        ),
                });


            } catch (error) {

                console.error(
                    "Failed to save message:",
                    error
                );
            }
        },

        new NewMessage({})
    );
}


module.exports =
    startMessageListener;