const WebSocket = require("ws");
const config = require("../config/config");

class WebSocketHandler {
  constructor(server, meetingManager) {
    this.meetingManager = meetingManager;
    this.clients = new Map();

    this.wss = new WebSocket.Server({ server });
    this.setupWebSocketServer();
    this.startHeartbeat();
  }

  setupWebSocketServer() {
    this.wss.on("connection", (ws) => {
      console.log("새 클라이언트 연결");
      this.setupClient(ws);
    });

    console.log("WebSocket 서버 초기화 완료");
  }

  setupClient(ws) {
    ws.isAlive = true;
    ws.on("pong", () => {
      ws.isAlive = true;
    });

    ws.on("message", async (data) => {
      try {
        const message = JSON.parse(data);
        await this.handleMessage(ws, message);
      } catch (error) {
        await this.handleAudioData(ws, data);
      }
    });

    ws.on("close", () => {
      this.handleDisconnect(ws);
    });

    ws.on("error", (error) => {
      console.error("WebSocket 오류:", error);
      this.handleDisconnect(ws);
    });
  }

  async handleMessage(ws, message) {
    const { type, meetingId, userId } = message;

    switch (type) {
      case "join":
        await this.handleJoin(ws, meetingId, userId);
        break;
      case "start_recording":
        await this.handleStartRecording(meetingId);
        break;
      case "stop_recording":
        await this.handleStopRecording(meetingId);
        break;
      case "end_meeting":
        await this.handleEndMeeting(meetingId);
        break;
      case "complete_audio_file":
        await this.handleCompleteAudioFile(ws, message);
        break;
      default:
        console.log("알 수 없는 메시지 타입:", type);
    }
  }

  async handleJoin(ws, meetingId, userId) {
    this.clients.set(ws, { meetingId, userId });

    const result = await this.meetingManager.joinMeeting(meetingId, userId);

    ws.send(
      JSON.stringify({
        type: "joined",
        meetingId,
        participants: result.participants,
        isRecording: result.isRecording, // 🔑 현재 녹음 상태 추가
      })
    );

    // 첫 번째 참가자 - 자동 녹음 시작
    if (result.participants.length === 1) {
      await this.meetingManager.startRecording(meetingId);
      this.broadcastToMeeting(meetingId, {
        type: "recording_started",
        autoStarted: true,
        startedBy: userId,
        message: `첫 번째 참가자(${userId}) 입장으로 녹음이 자동 시작되었습니다`,
      });
      this.sendPDFLinkAfterDelay(meetingId);
    }
    // 🔑 두 번째 참가자부터 - 이미 녹음 중이면 개별적으로 알림
    else {
      const meeting = this.meetingManager.getMeeting(meetingId);
      if (meeting && meeting.isRecording) {
        ws.send(
          JSON.stringify({
            type: "recording_already_started",
            message: "이미 녹음이 진행 중입니다",
          })
        );
      }

      if (result.shouldCreateFile) {
        this.meetingManager
          .createMergedFile(meetingId)
          .catch((err) => console.error("병합 실패:", err));
      }
    }

    console.log(
      `👤 ${userId} 님이 ${meetingId} 회의에 참여 (총 ${result.participants.length}명)`
    );
  }

  async handleStartRecording(meetingId) {
    const meeting = this.meetingManager.getMeeting(meetingId);
    if (meeting && meeting.isRecording) {
      console.log(`⚠️  이미 녹음 중인 회의: ${meetingId}`);
      return;
    }

    await this.meetingManager.startRecording(meetingId);
    this.broadcastToMeeting(meetingId, {
      type: "recording_started",
      autoStarted: false,
      message: "수동으로 녹음이 시작되었습니다",
    });
    console.log(`🔴 수동 녹음 시작: ${meetingId}`);
  }

  async handleStopRecording(meetingId) {
    console.log(`⏹️ 녹음 중지 요청: ${meetingId}`);

    await new Promise((resolve) => setTimeout(resolve, 2000));

    await this.meetingManager.stopRecording(meetingId);
    this.broadcastToMeeting(meetingId, { type: "recording_stopped" });
    console.log(`⏹️ 녹음 중지 완료: ${meetingId}`);
  }

  async handleEndMeeting(meetingId) {
    console.log(`📞 회의 종료 요청: ${meetingId}`);

    // 현재 녹음 중이면 먼저 중지
    const meeting = this.meetingManager.getMeeting(meetingId);
    if (meeting && meeting.isRecording) {
      console.log(`🔄 녹음 중인 회의 종료 처리: ${meetingId}`);

      // 마지막 데이터 수신 대기
      await new Promise((resolve) => setTimeout(resolve, 5000));

      await this.meetingManager.stopRecording(meetingId);
    }

    // 추가 대기 후 회의 종료
    await new Promise((resolve) => setTimeout(resolve, 3000));
    await this.meetingManager.endMeeting(meetingId);

    this.broadcastToMeeting(meetingId, { type: "meeting_ended" });
    console.log(`📞 회의 종료 완료: ${meetingId}`);
  }

  async handleCompleteAudioFile(ws, message) {
    const client = this.clients.get(ws);
    if (!client) return;

    console.log(`📦 완전한 오디오 파일 수신: ${message.size} bytes`);
  }

  async handleAudioData(ws, audioData) {
    const client = this.clients.get(ws);
    if (!client) return;

    await this.meetingManager.addCompleteAudioFile(client.meetingId, audioData);
  }
  async sendPDFLinkToMeeting(meetingId = "result_final_job_002") {
    try {
      console.log(`📋 PDF 데이터 조회 시작: ${meetingId}`);

      // 🔑 API.js의 getPDF 함수 호출
      const { getPDF } = require("./API");
      const pdfData = await getPDF(meetingId);

      console.log("API 응답 데이터:", pdfData);

      // 🔑 API 응답 데이터를 사용해서 메시지 생성
      const message = JSON.stringify({
        type: "pdf_link",
        meetingId: meetingId,
        title: pdfData.title,
        createdAt: pdfData.createdAt,
        summaryText: pdfData.summaryText,
        pdfLinks: pdfData.pdfLinks,
      });

      console.log(`📄 PDF 링크와 요약 전송 to ${meetingId}: ${pdfData.title}`);

      let sentCount = 0;
      this.clients.forEach((client, ws) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(message);
          sentCount++;
        }
      });

      console.log(`✅ ${sentCount}명에게 회의 요약 전송 완료`);
      return sentCount;
    } catch (error) {
      console.error("❌ PDF 링크 전송 실패:", error);

      // 🔑 API 호출 실패 시 에러 메시지 전송
      const errorMessage = JSON.stringify({
        type: "pdf_error",
        meetingId: meetingId,
        message: "PDF 데이터를 불러오는 중 오류가 발생했습니다.",
        error: error.message,
      });

      this.clients.forEach((client, ws) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(errorMessage);
        }
      });

      return 0;
    }
  }
  async sendIntermediateSummary(meetingId = "result_final_job_002") {
    try {
      console.log(`📋 중간 요약 데이터 조회 시작: ${meetingId}`);

      // 🔑 API.js의 getMeetingInfo 함수 호출
      const { getMeetingInfo } = require("./API");
      const summaryData = await getMeetingInfo(meetingId);

      console.log("중간 요약 API 응답 데이터:", summaryData);

      // 🔑 summaryText JSON 파싱 (검색 결과[3] 참고)
      let parsedSummaryText;
      try {
        if (typeof summaryData.summaryText === "string") {
          parsedSummaryText = JSON.parse(summaryData.summaryText);
          console.log("✅ summaryText JSON 파싱 성공");
        } else {
          parsedSummaryText = summaryData.summaryText;
        }
      } catch (parseError) {
        console.error("❌ summaryText 파싱 실패:", parseError);
        parsedSummaryText = {
          summary: "",
          keywords: null,
          decisions: [],
          todo: null,
          qa: null,
        };
      }

      // 🔑 pdfLinks 제외한 중간 요약 메시지 생성
      const message = JSON.stringify({
        type: "intermediate_summary", // 타입 변경으로 구분
        meetingId: meetingId,
        title: summaryData.title || "회의 중간 요약",
        createdAt: summaryData.createdAt,
        summaryText: parsedSummaryText, // 파싱된 객체 사용
        // pdfLinks는 제외
      });

      console.log(`📄 중간 요약 전송 to ${meetingId}: ${summaryData.title}`);

      let sentCount = 0;
      this.clients.forEach((client, ws) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(message);
          sentCount++;
        }
      });

      console.log(`✅ ${sentCount}명에게 중간 요약 전송 완료`);
      return sentCount;
    } catch (error) {
      console.error("❌ 중간 요약 전송 실패:", error);

      // 🔑 API 호출 실패 시 에러 메시지 전송
      const errorMessage = JSON.stringify({
        type: "summary_error",
        meetingId: meetingId,
        message: "중간 요약 데이터를 불러오는 중 오류가 발생했습니다.",
        error: error.message,
      });

      this.clients.forEach((client, ws) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(errorMessage);
        }
      });

      return 0;
    }
  }

  broadcastToMeeting(meetingId, message) {
    this.clients.forEach((client, ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
      }
    });
  }

  handleDisconnect(ws) {
    const client = this.clients.get(ws);
    if (client) {
      this.meetingManager.removeParticipant(client.meetingId, client.userId);
      this.clients.delete(ws);
      console.log(`👋 클라이언트 연결 해제: ${client.userId}`);
    }
  }

  startHeartbeat() {
    setInterval(() => {
      this.wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
          ws.terminate();
          return;
        }

        ws.isAlive = false;
        ws.ping();
      });
    }, config.websocket.pingInterval);
  }

  close() {
    this.wss.close();
  }
}

module.exports = WebSocketHandler;
