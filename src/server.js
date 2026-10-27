
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");

const app = express();

app.use(cors());
app.use(express.json({ limit: "10kb" }));

app.get("/", (req, res) => {
  res.json({
    message: "Background Digest Service is running",
  });
});

app.use("/api/auth", require("./routes/auth"));
app.use("/api/jobs", require("./routes/jobs"));

app.use((req, res) => {
  res.status(404).json({ error: "Route not found." });
});

const startServer = async () => {
  if (!process.env.JWT_SECRET || !process.env.MONGO_URI) {
    console.error("MONGO_URI and JWT_SECRET must be configured.");
    process.exit(1);
  }

  await connectDB();

  const PORT = process.env.PORT || 3000;

  app.listen(PORT, () => {
    console.log(`API server running on port ${PORT}`);
  });
};

startServer();
