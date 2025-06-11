const path = require("path"); // 이 줄 추가
const fs = require("fs-extra"); // 필요시 추가
const AudioProcessor = require("./AudioProcessor");

class MeetingManager {
  constructor() {
    this.meetings = new Map();
    this.audioProcessor = new AudioProcessor();
  }

  joinMeeting(meetingId, userId) {
    if (!this.meetings.has(meetingId)) {
      this.meetings.set(meetingId, {
        participants: new Set(),
        isRecording: false,
        completeFiles: [],
        finalFiles: [],
        cumulativeFile: null,
        createdAt: new Date(),
      });
    }

    const meeting = this.meetings.get(meetingId);
    const hadParticipants = meeting.participants.size > 0;

    meeting.participants.add(userId);

    const shouldCreateFile =
      hadParticipants &&
      meeting.isRecording &&
      meeting.completeFiles.length > 0;

    return {
      participants: Array.from(meeting.participants),
      shouldCreateFile,
    };
  }

  async startRecording(meetingId) {
    const meeting = this.meetings.get(meetingId);
    if (!meeting) return false;

    meeting.isRecording = true;
    meeting.completeFiles = [];
    return true;
  }

  async stopRecording(meetingId) {
    const meeting = this.meetings.get(meetingId);
    if (!meeting || !meeting.isRecording) return false;

    console.log(`🔄 녹음 중지 처리 시작: ${meetingId}`);
    meeting.isRecording = false;

    // 현재 수집된 파일들이 있으면 누적 파일 생성
    if (meeting.completeFiles && meeting.completeFiles.length > 0) {
      console.log(
        `📁 마지막 세그먼트 처리: ${meeting.completeFiles.length}개 파일`
      );
      await this.createCumulativeFile(meetingId);
    } else {
      console.log(`ℹ️ 처리할 새 세그먼트 없음: ${meetingId}`);
    }

    console.log(`✅ 녹음 중지 처리 완료: ${meetingId}`);
    return true;
  }

  async endMeeting(meetingId) {
    const meeting = this.meetings.get(meetingId);
    if (!meeting) return false;

    console.log(`🔄 회의 종료 처리 시작: ${meetingId}`);

    // 아직 녹음 중이면 중지 처리
    if (meeting.isRecording) {
      console.log(`⚠️ 녹음 중인 상태에서 회의 종료: ${meetingId}`);
      await this.stopRecording(meetingId);
    }

    // 최종 파일을 finalFiles에 추가
    if (meeting.cumulativeFile) {
      meeting.finalFiles = meeting.finalFiles || [];
      meeting.finalFiles.push(meeting.cumulativeFile);
      console.log(
        `📄 최종 파일 등록: ${path.basename(meeting.cumulativeFile)}`
      );
    }

    // 혹시 처리되지 않은 완전한 파일들이 있다면 마지막으로 처리
    if (meeting.completeFiles && meeting.completeFiles.length > 0) {
      console.log(
        `⚠️ 미처리 파일 발견, 마지막 처리: ${meeting.completeFiles.length}개`
      );
      const lastFile = await this.createCumulativeFile(meetingId);
      if (lastFile && !meeting.finalFiles.includes(lastFile)) {
        meeting.finalFiles.push(lastFile);
      }
    }

    console.log(
      `📊 최종 통계 - 생성된 파일: ${
        meeting.finalFiles ? meeting.finalFiles.length : 0
      }개`
    );
    this.meetings.delete(meetingId);

    console.log(`✅ 회의 종료 처리 완료: ${meetingId}`);
    return true;
  }

  async addCompleteAudioFile(meetingId, audioBuffer) {
    const meeting = this.meetings.get(meetingId);
    if (!meeting || !meeting.isRecording) return;

    const webmFile = await this.audioProcessor.saveCompleteWebMFile(
      meetingId,
      audioBuffer
    );
    if (webmFile) {
      meeting.completeFiles = meeting.completeFiles || [];
      meeting.completeFiles.push(webmFile);
    }
  }

  async createCumulativeFile(meetingId) {
    const meeting = this.meetings.get(meetingId);
    if (
      !meeting ||
      !meeting.completeFiles ||
      meeting.completeFiles.length === 0
    )
      return null;

    const timestamp = Date.now();

    try {
      const currentSegmentFile = await this.audioProcessor.createMergedFile(
        `${meetingId}_segment`,
        meeting.completeFiles
      );

      if (!currentSegmentFile) {
        console.log("❌ 현재 세그먼트 병합 실패");
        return null;
      }

      let newCumulativeFile;

      if (
        meeting.cumulativeFile &&
        (await fs.pathExists(meeting.cumulativeFile))
      ) {
        console.log(`📎 이전 파일과 병합: ${meeting.cumulativeFile}`);

        newCumulativeFile = await this.audioProcessor.mergeTwoFiles(
          meeting.cumulativeFile,
          currentSegmentFile,
          `${meetingId}_cumulative_${timestamp}`
        );

        console.log(
          `📁 이전 누적 파일 보존: ${path.basename(meeting.cumulativeFile)}`
        );
      } else {
        console.log(`📎 첫 번째 누적 파일 생성`);
        newCumulativeFile = await this.audioProcessor.renameFile(
          currentSegmentFile,
          `${meetingId}_cumulative_${timestamp}`
        );
      }

      console.log(
        `📁 현재 세그먼트 파일 보존: ${path.basename(currentSegmentFile)}`
      );

      meeting.cumulativeFile = newCumulativeFile;
      meeting.completeFiles = [];

      console.log(`✅ 누적 병합 완료: ${newCumulativeFile}`);
      return newCumulativeFile;
    } catch (error) {
      console.error("❌ 누적 병합 실패:", error);
      return null;
    }
  }

  async createMergedFile(meetingId) {
    return await this.createCumulativeFile(meetingId);
  }

  removeParticipant(meetingId, userId) {
    const meeting = this.meetings.get(meetingId);
    if (meeting) {
      meeting.participants.delete(userId);
    }
  }

  getMeeting(meetingId) {
    return this.meetings.get(meetingId);
  }

  getAllMeetings() {
    const result = [];
    this.meetings.forEach((meeting, meetingId) => {
      result.push({
        id: meetingId,
        participants: Array.from(meeting.participants),
        isRecording: meeting.isRecording,
        filesCount: meeting.finalFiles ? meeting.finalFiles.length : 0,
        hasCurrentRecording: !!meeting.cumulativeFile,
        createdAt: meeting.createdAt,
      });
    });
    return result;
  }

  getMeetingFiles(meetingId) {
    const meeting = this.meetings.get(meetingId);
    if (!meeting) return [];

    const files = meeting.finalFiles ? [...meeting.finalFiles] : [];

    if (meeting.cumulativeFile) {
      files.push(meeting.cumulativeFile);
    }

    return files;
  }
}

module.exports = MeetingManager;
