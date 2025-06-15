const express = require("express");
const router = express.Router();

router.get("/webhook/complete", async (req, res) => {
  try {
    res.status(200).send("Webhook received successfully");
  } catch (e) {
    console.error("Error in webhook handler:", e);
    res.status(500).send("Internal Server Error");
  }
});

module.exports = router;
