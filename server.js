const MeetingServer = require("./src/MeetingServer");
const {
  createWebhookRouter,
  createWebhookRouter2,
} = require("./src/AwsJobTrigger"); // 🔑 구조분해할당

// MeetingServer 인스턴스 생성
const meetingServer = new MeetingServer();

// 🔑 두 웹훅 라우터 모두 등록
const webhookRouter = createWebhookRouter(meetingServer.wsHandler);
const webhookRouter2 = createWebhookRouter2(meetingServer.wsHandler);

meetingServer.app.use("/api", webhookRouter); // /api/webhook/complete
meetingServer.app.use("/api", webhookRouter2); // /api/webhook/complete2

// 서버 시작
meetingServer.start();

// 종료 처리
process.on("SIGINT", () => {
  console.log("\n서버 종료 중...");
  meetingServer.stop();
  process.exit(0);
});
