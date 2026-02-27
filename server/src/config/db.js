const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    console.log(`✅ MongoDB connected: ${conn.connection.host}`);

    // Connection event listeners
    mongoose.connection.on("error", (err) => {
      console.error(`❌ MongoDB runtime error: ${err.message}`);
    });

    mongoose.connection.on("disconnected", () => {
      console.warn("⚠️  MongoDB disconnected. Attempting reconnect...");
    });

    mongoose.connection.on("reconnected", () => {
      console.log("🔄 MongoDB reconnected");
    });
  } catch (error) {
    console.error(`❌ MongoDB connection error: ${error.message}`);
    // Retry once after 5 seconds before giving up
    console.log("🔄 Retrying MongoDB connection in 5s...");
    await new Promise((r) => setTimeout(r, 5000));
    try {
      await mongoose.connect(process.env.MONGO_URI);
      console.log("✅ MongoDB connected on retry");
    } catch (retryError) {
      console.error(`❌ MongoDB retry failed: ${retryError.message}`);
      process.exit(1);
    }
  }
};

module.exports = connectDB;
