
require("dotenv").config();

const crypto = require("crypto");
const connectDB = require("./config/db");
const Job = require("./models/Job");

const POLL_INTERVAL = 2000;
const STALE_AFTER_MS = 60 * 1000;
const MAX_ATTEMPTS = 3;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function processOneJob() {
  const staleBefore = new Date(Date.now() - STALE_AFTER_MS);

  // A job repeatedly abandoned by a crashed worker must not retry forever.
  await Job.updateMany(
    {
      status: "processing",
      attempts: { $gte: MAX_ATTEMPTS },
      startedAt: { $lt: staleBefore },
    },
    {
      $set: {
        status: "failed",
        error: "Worker stopped repeatedly; retry limit reached.",
      },
    }
  );

  // Atomically claim one pending job, or recover an abandoned job.
  const token = crypto.randomUUID();

  const job = await Job.findOneAndUpdate(
    {
      attempts: { $lt: MAX_ATTEMPTS },
      $or: [
        { status: "pending" },
        {
          status: "processing",
          startedAt: { $lt: staleBefore },
        },
      ],
    },
    {
      $set: {
        status: "processing",
        startedAt: new Date(),
        workerToken: token,
        error: null,
      },
      $inc: { attempts: 1 },
    },
    {
      new: true,
      sort: { createdAt: 1 },
    }
  );

  if (!job) return false;

  try {
    // Replace this sample work with real digest generation later.
    // The output is deterministic for this job, so retries are safe.
    const result =
      `Digest job ${job._id} for user ${job.userId}. ` +
      `Requested at ${job.createdAt.toISOString()}.`;

    await Job.updateOne(
      { _id: job._id, workerToken: token },
      {
        $set: {
          status: "completed",
          result,
          completedAt: new Date(),
          error: null,
        },
      }
    );

    console.log(`Completed job ${job._id}`);
  } catch (error) {
    console.error(`Job ${job._id} failed:`, error.message);

    await Job.updateOne(
      { _id: job._id, workerToken: token },
      {
        $set: {
          status: job.attempts >= MAX_ATTEMPTS ? "failed" : "pending",
          error: "Processing failed; the job may be retried.",
        },
      }
    );
  }

  return true;
}

async function startWorker() {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI must be configured.");
  }

  await connectDB();
  console.log("Background worker started.");

  while (true) {
    try {
      const foundJob = await processOneJob();

      if (!foundJob) {
        await sleep(POLL_INTERVAL);
      }
    } catch (error) {
      console.error("Worker loop error:", error.message);
      await sleep(POLL_INTERVAL);
    }
  }
}

startWorker().catch((error) => {
  console.error("Worker startup failed:", error.message);
  process.exit(1);
});
