
const express = require("express");
const mongoose = require("mongoose");
const auth = require("../middleware/auth");
const Job = require("../models/Job");

const router = express.Router();

// All routes below require authentication.
router.use(auth);

// Create or safely retry a job.
router.post("/", async (req, res) => {
  try {
    const key = req.get("Idempotency-Key");

    if (
      typeof key !== "string" ||
      key.length < 1 ||
      key.length > 128
    ) {
      return res.status(400).json({
        error: "Provide an Idempotency-Key header (1-128 characters).",
      });
    }

    const existing = await Job.findOne({
      userId: req.userId,
      idempotencyKey: key,
    });

    if (existing) {
      return res.status(200).json({
        message: "This request was already accepted.",
        job: existing,
      });
    }

    const job = await Job.create({
      userId: req.userId,
      type: "digest",
      idempotencyKey: key,
      status: "pending",
    });

    return res.status(202).json({
      message: "Job accepted for background processing.",
      job,
    });
  } catch (error) {
    // Handles two identical requests arriving at the same time.
    if (error.code === 11000) {
      const existing = await Job.findOne({
        userId: req.userId,
        idempotencyKey: req.get("Idempotency-Key"),
      });

      if (existing) {
        return res.status(200).json({
          message: "This request was already accepted.",
          job: existing,
        });
      }
    }

    console.error("Create job error:", error.message);
    return res.status(500).json({ error: "Could not create job." });
  }
});

// List only the signed-in user's jobs.
router.get("/", async (req, res) => {
  try {
    const jobs = await Job.find({ userId: req.userId })
      .sort({ createdAt: -1 })
      .limit(100);

    return res.json({ jobs });
  } catch (error) {
    console.error("List jobs error:", error.message);
    return res.status(500).json({ error: "Could not retrieve jobs." });
  }
});

// Retrieve one job belonging to the signed-in user.
router.get("/:id", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: "Invalid job ID." });
  }

  try {
    const job = await Job.findOne({
      _id: req.params.id,
      userId: req.userId,
    });

    if (!job) {
      return res.status(404).json({ error: "Job not found." });
    }

    return res.json({ job });
  } catch (error) {
    console.error("Get job error:", error.message);
    return res.status(500).json({ error: "Could not retrieve job." });
  }
});

module.exports = router;
