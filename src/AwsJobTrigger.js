const express = require("express");

function createWebhookRouter(wsHandler) {
  const router = express.Router(); // 🔑 함수 내부에서 새로 생성

  router.get("/webhook/complete", async (req, res) => {
    try {
      const meetingId = req.query.meetingId || "001";
      console.log(`Final PDF Webhook received for meetingId: ${meetingId}`);

      if (wsHandler && typeof wsHandler.sendPDFLinkToMeeting === "function") {
        await wsHandler.sendPDFLinkToMeeting(meetingId);
      }

      res.status(200).send("Final PDF webhook received successfully");
    } catch (e) {
      console.error("Error in final PDF webhook handler:", e);
      res.status(500).send("Internal Server Error");
    }
  });

  return router;
}

function createWebhookRouter2(wsHandler) {
  const router = express.Router(); // 🔑 별도 router 객체 생성

  router.get("/webhook/complete2", async (req, res) => {
    try {
      const meetingId = req.query.meetingId || "001";
      console.log(
        `Intermediate Summary Webhook received for meetingId: ${meetingId}`
      );

      if (
        wsHandler &&
        typeof wsHandler.sendIntermediateSummary === "function"
      ) {
        await wsHandler.sendIntermediateSummary(meetingId);
      }

      res
        .status(200)
        .send("Intermediate summary webhook received successfully");
    } catch (e) {
      console.error("Error in intermediate summary webhook handler:", e);
      res.status(500).send("Internal Server Error");
    }
  });

  return router;
}

module.exports = {
  createWebhookRouter,
  createWebhookRouter2,
};
