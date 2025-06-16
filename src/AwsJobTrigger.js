const express = require("express");
const router = express.Router();

function createWebhookRouter(wsHandler) {
  router.get("/webhook/complete", async (req, res) => {
    try {
      // 🔑 쿼리 파라미터에서 meetingId 받기
      const meetingId = req.query.meetingId || "001";
      console.log(`Webhook received for meetingId: ${meetingId}`);

      if (wsHandler && typeof wsHandler.sendPDFLinkToMeeting === "function") {
        // 🔑 async 함수이므로 await 추가
        await wsHandler.sendPDFLinkToMeeting(meetingId);
      }

      res.status(200).send("Webhook received successfully");
    } catch (e) {
      console.error("Error in webhook handler:", e);
      res.status(500).send("Internal Server Error");
    }
  });

  return router;
}

function createWebhookRouter2(wsHandler) {
  router.get("/webhook/complete2", async (req, res) => {
    try {
      const meetingId = "001";
      console.log(`Webhook received for meetingId: ${meetingId}`);

      if (wsHandler && typeof wsHandler.sendPDFLinkAfterDelay === "function") {
        wsHandler.sendPDFLinkAfterDelay(meetingId);
      }

      res.status(200).send("Webhook received successfully");
    } catch (e) {
      console.error("Error in webhook handler:", e);
      res.status(500).send("Internal Server Error");
    }
  });

  return router;
}

module.exports = createWebhookRouter;
