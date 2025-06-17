const path = require("path");
const fs = require("fs-extra");
const AudioProcessor = require("./AudioProcessor");
const { uploadFileMiddle, uploadFileFinal } = require("./API");
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
      isRecording: meeting.isRecording,
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

    if (meeting.completeFiles && meeting.completeFiles.length > 0) {
      console.log(
        `📁 마지막 세그먼트 처리: ${meeting.completeFiles.length}개 파일`
      );
      await this.createCumulativeFile(meetingId, true);
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

    if (meeting.isRecording) {
      console.log(`⚠️ 녹음 중인 상태에서 회의 종료: ${meetingId}`);
      await this.stopRecording(meetingId);
    }

    if (meeting.cumulativeFile) {
      meeting.finalFiles = meeting.finalFiles || [];
      meeting.finalFiles.push(meeting.cumulativeFile);
      console.log(
        `📄 최종 파일 등록: ${path.basename(meeting.cumulativeFile)}`
      );
    }

    if (meeting.completeFiles && meeting.completeFiles.length > 0) {
      console.log(
        `⚠️ 미처리 파일 발견, 마지막 처리: ${meeting.completeFiles.length}개`
      );
      const lastFile = await this.createCumulativeFile(meetingId, true);
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

  async createCumulativeFile(meetingId, isEndingMeeting = false) {
    const meeting = this.meetings.get(meetingId);
    if (
      !meeting ||
      !meeting.completeFiles ||
      meeting.completeFiles.length === 0
    )
      return null;

    const timestamp = Date.now();
    let uploadResult = null;

    try {
      // 🔑 새로운 파일들만 필터링
      const processedFiles = meeting.processedFiles || new Set();
      const newFiles = meeting.completeFiles.filter(
        (file) => !processedFiles.has(file)
      );

      if (newFiles.length === 0) {
        console.log("⚠️ 새로운 파일이 없음 - 중복 처리 방지");
        meeting.completeFiles = [];
        return meeting.cumulativeFile;
      }

      console.log(
        `🔄 새로운 파일만 처리: ${newFiles.length}개 (전체: ${meeting.completeFiles.length}개)`
      );

      // 처리된 파일들 추적에 추가
      newFiles.forEach((file) => processedFiles.add(file));
      meeting.processedFiles = processedFiles;
      meeting.completeFiles = [];

      const currentSegmentFile = await this.audioProcessor.createMergedFile(
        `${meetingId}_segment_${timestamp}`,
        newFiles // 🔑 새로운 파일들만 사용
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
        console.log(`📎 이전 누적 파일과 새 세그먼트 병합`);

        newCumulativeFile = await this.audioProcessor.mergeTwoFiles(
          meeting.cumulativeFile,
          currentSegmentFile,
          `${meetingId}_cumulative_${timestamp}`
        );
      } else {
        console.log(`📎 첫 번째 누적 파일 생성`);
        newCumulativeFile = await this.audioProcessor.renameFile(
          currentSegmentFile,
          `${meetingId}_cumulative_${timestamp}`
        );
      }

      await this.cleanupSegmentFiles(
        newFiles,
        currentSegmentFile,
        newCumulativeFile
      );
      meeting.cumulativeFile = newCumulativeFile;

      console.log(`✅ 누적 병합 완료: ${path.basename(newCumulativeFile)}`);
      try {
        const customKey = `${path.basename(newCumulativeFile)}`;
        if (isEndingMeeting) {
          // 회의 종료 시 최종 업로드
          // uploadResult = await uploadFileFinal(newCumulativeFile, customKey);
          console.log(`☁️ 최종 파일 S3 업로드 성공: ${uploadResult.s3Url}`);
        } else {
          // 회의 중 중간 업로드
          // uploadResult = await uploadFileMiddle(newCumulativeFile, customKey);
          console.log(`☁️ 중간 파일 S3 업로드 성공: ${uploadResult.s3Url}`);
        }
      } catch (uploadError) {
        console.error(`❌ S3 업로드 실패: ${uploadError.message}`);
        // 업로드 실패해도 로컬 파일은 유지
      }
      return newCumulativeFile;
    } catch (error) {
      console.error("❌ 누적 병합 실패:", error);
      return null;
    }
  }

  // 🔑 별도 함수로 정리 로직 분리
  async cleanupSegmentFiles(
    segmentFiles,
    currentSegmentFile,
    newCumulativeFile
  ) {
    console.log(`🗑️ 세그먼트 파일 정리: ${segmentFiles.length}개`);

    // 원본 세그먼트 파일들 삭제
    for (const file of segmentFiles) {
      try {
        if (await fs.pathExists(file)) {
          await fs.remove(file);
          console.log(`✅ 삭제: ${path.basename(file)}`);
        }
      } catch (error) {
        console.error(`❌ 삭제 실패: ${path.basename(file)}`);
      }
    }

    // 현재 세그먼트 파일 삭제 (누적 파일과 다른 경우)
    if (
      currentSegmentFile !== newCumulativeFile &&
      (await fs.pathExists(currentSegmentFile))
    ) {
      try {
        await fs.remove(currentSegmentFile);
        console.log(
          `✅ 현재 세그먼트 삭제: ${path.basename(currentSegmentFile)}`
        );
      } catch (error) {
        console.error(
          `❌ 현재 세그먼트 삭제 실패: ${path.basename(currentSegmentFile)}`
        );
      }
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
