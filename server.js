const MeetingServer = require("./src/MeetingServer");
const createWebhookRouter = require("./src/AwsJobTrigger");

// 🔑 MeetingServer 인스턴스 생성
const meetingServer = new MeetingServer();

// 🔑 웹훅 라우터를 Express 앱에 추가
const webhookRouter = createWebhookRouter(meetingServer.wsHandler);
meetingServer.app.use("/api", webhookRouter);

// 서버 시작
meetingServer.start();

// 종료 처리
process.on("SIGINT", () => {
  console.log("\n서버 종료 중...");
  meetingServer.stop();
  process.exit(0);
});
