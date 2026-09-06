const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
    {
        telegramMessageId: {
            type: Number,
            required: true,
        },

        chatId: {
            type: String,
            required: true,
        },

        senderId: {
            type: String,
            required: true,
        },

        senderUsername: {
            type: String,
            default: null,
        },

        senderFirstName: {
            type: String,
            default: null,
        },

        senderLastName: {
            type: String,
            default: null,
        },

        text: {
            type: String,
            default: "",
        },

        date: {
            type: Date,
            required: true,
        },

        media: {
            type: {
                type: String,
                enum: ["photo", "video", "voice"],
                default: null,
            },

            storageKey: {
                type: String,
                default: null,
            },

            mimeType: {
                type: String,
                default: null,
            },

            size: {
                type: Number,
                default: null,
            },

            originalName: {
                type: String,
                default: null,
            },
        },

        deleted: {
            type: Boolean,
            default: false,
        },

        archived: {
            type: Boolean,
            default: false,
        },

        archivedAt: {
            type: Date,
            default: null,
        },

        archiveMessageId: {
            type: Number,
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

messageSchema.index(
    { chatId: 1, telegramMessageId: 1 },
    { unique: true }
);

module.exports = mongoose.model("Message", messageSchema);