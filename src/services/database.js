const mongoose = require("mongoose");

async function connectDatabase() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);

        console.log("MongoDB connected");
    } catch (error) {
        console.error("MongoDB connection failed:");
        console.error(error);

        process.exit(1);
    }
}

module.exports = connectDatabase;