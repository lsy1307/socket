const MeetingServer = require("./src/MeetingServer");

// 서버 시작
const server = new MeetingServer();
server.start();

// 종료 처리
process.on("SIGINT", () => {
  console.log("\n서버 종료 중...");
  server.stop();
  process.exit(0);
});
