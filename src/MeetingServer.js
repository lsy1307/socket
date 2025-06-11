const express = require("express");
const http = require("http");
const fs = require("fs-extra");
const path = require("path");

const config = require("../config/config");
const WebSocketHandler = require("./WebSocketHandler");
const MeetingManager = require("./MeetingManager");

class MeetingServer {
  constructor() {
    this.app = express();
    this.server = http.createServer(this.app);

    this.meetingManager = new MeetingManager();
    this.wsHandler = new WebSocketHandler(this.server, this.meetingManager);

    this.setupDirectories();
    this.setupExpress();
  }

  setupDirectories() {
    fs.ensureDirSync(config.directories.recordings);
    fs.ensureDirSync(config.directories.temp);
    console.log("디렉토리 초기화 완료");
  }

  setupExpress() {
    this.app.use(express.static(config.directories.public));

    this.app.get("/api/meetings", (req, res) => {
      const meetings = this.meetingManager.getAllMeetings();
      res.json(meetings);
    });

    this.app.get("/api/meetings/:id/files", (req, res) => {
      const meetingId = req.params.id;
      const files = this.meetingManager.getMeetingFiles(meetingId);
      res.json(files);
    });

    this.app.get("/health", (req, res) => {
      res.json({ status: "OK", timestamp: new Date().toISOString() });
    });

    console.log("Express 서버 설정 완료");
  }

  start() {
    this.server.listen(config.server.port, () => {
      console.log(`=================================`);
      console.log(`🎙️  회의 녹음 서버 시작`);
      console.log(
        `📍 주소: http://${config.server.host}:${config.server.port}`
      );
      console.log(
        `🔧 자동 녹음: ${
          config.meeting.autoStartRecording ? "활성화" : "비활성화"
        }`
      );
      console.log(`=================================`);
    });
  }

  stop() {
    this.wsHandler.close();
    this.server.close();
    console.log("서버 종료됨");
  }
}

module.exports = MeetingServer;
