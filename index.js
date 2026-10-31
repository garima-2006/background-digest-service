
const { spawn } = require("child_process");
const path = require("path");

// Start the background worker as a child process.
const worker = spawn(
  process.execPath,
  [path.join(__dirname, "src", "worker.js")],
  { stdio: "inherit" }
);

worker.on("error", (error) => {
  console.error("Worker process error:", error.message);
});

// Start the API server.
require("./src/server");
