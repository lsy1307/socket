const fs = require("fs-extra");
const path = require("path");
const ffmpeg = require("fluent-ffmpeg");
const config = require("../config/config");

class AudioProcessor {
  async createMergedFile(meetingId, completeWebMFiles) {
    if (!completeWebMFiles || completeWebMFiles.length === 0) return null;

    const timestamp = Date.now();
    const outputFile = path.join(
      config.directories?.recordings || "./recordings",
      `${meetingId}_${timestamp}.mp3`
    );

    try {
      if (completeWebMFiles.length === 1) {
        return await this.convertSingleWebMFile(
          completeWebMFiles[0],
          outputFile
        );
      } else {
        return await this.mergeCompleteWebMFiles(completeWebMFiles, outputFile);
      }
    } catch (error) {
      console.error("파일 생성 실패:", error);
      return null;
    }
  }

  async saveCompleteWebMFile(meetingId, audioBuffer) {
    const timestamp = Date.now();
    const webmFile = path.join(
      config.directories?.temp || "./temp",
      `${meetingId}_complete_${timestamp}.webm`
    );

    try {
      await fs.writeFile(webmFile, audioBuffer);

      const stats = await fs.stat(webmFile);
      if (stats.size < 1000) {
        await fs.remove(webmFile);
        return null;
      }

      const isValid = await this.validateWebMFile(webmFile);
      if (!isValid) {
        console.log(`❌ 유효하지 않은 WebM 파일: ${path.basename(webmFile)}`);
        await fs.remove(webmFile);
        return null;
      }

      console.log(
        `💾 완전한 WebM 파일 저장: ${path.basename(webmFile)} (${
          stats.size
        } bytes)`
      );
      return webmFile;
    } catch (error) {
      console.error("WebM 파일 저장 실패:", error);
      return null;
    }
  }

  async validateWebMFile(filePath) {
    return new Promise((resolve) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) {
          console.log(`파일 검증 실패: ${err.message}`);
          resolve(false);
        } else {
          const hasAudioStream =
            metadata.streams &&
            metadata.streams.some((stream) => stream.codec_type === "audio");
          resolve(hasAudioStream);
        }
      });
    });
  }

  async convertSingleWebMFile(inputFile, outputFile) {
    return new Promise((resolve, reject) => {
      console.log(`🔄 단일 파일 변환 시작: ${path.basename(inputFile)}`);

      ffmpeg(inputFile)
        .audioCodec(config.audio?.defaultCodec || "libmp3lame")
        .audioBitrate(config.audio?.bitrate || "128k")
        .audioChannels(config.audio?.channels || 1)
        .audioFrequency(config.audio?.frequency || 44100)
        .on("end", () => {
          console.log(`🎵 단일 파일 변환 완료: ${path.basename(outputFile)}`);
          this.deleteFile(inputFile); // 중간 파일 삭제하지 않음
          resolve(outputFile);
        })
        .on("error", (conversionErr) => {
          console.log("MP3 변환 실패, AAC로 시도...");
          this.convertToAAC(inputFile, outputFile.replace(".mp3", ".m4a"))
            .then((aacFile) => {
              this.deleteFile(inputFile); // 중간 파일 삭제하지 않음
              resolve(aacFile);
            })
            .catch(reject);
        })
        .save(outputFile);
    });
  }

  async mergeCompleteWebMFiles(webmFiles, outputFile) {
    const validFiles = [];
    for (const file of webmFiles) {
      if ((await fs.pathExists(file)) && (await this.validateWebMFile(file))) {
        validFiles.push(file);
      } else {
        console.log(`❌ 유효하지 않은 파일 제외: ${path.basename(file)}`);
      }
    }

    if (validFiles.length === 0) {
      throw new Error("유효한 WebM 파일이 없습니다");
    }

    if (validFiles.length === 1) {
      return await this.convertSingleWebMFile(validFiles[0], outputFile);
    }

    return new Promise((resolve, reject) => {
      console.log(`🔄 다중 파일 병합 시작: ${validFiles.length}개 파일`);

      const command = ffmpeg();

      validFiles.forEach((file) => {
        command.input(file);
      });

      const filterComplex =
        validFiles.map((_, index) => `[${index}:a]`).join("") +
        `concat=n=${validFiles.length}:v=0:a=1[outa]`;
      command
        .complexFilter(filterComplex)
        .outputOptions(["-map", "[outa]"])
        .audioCodec(config.audio?.defaultCodec || "libmp3lame")
        .audioBitrate(config.audio?.bitrate || "128k")
        .audioChannels(config.audio?.channels || 1)
        .audioFrequency(config.audio?.frequency || 44100)
        .on("end", () => {
          console.log(`🎵 다중 파일 병합 완료: ${path.basename(outputFile)}`);
          validFiles.forEach((file) => {
            this.deleteFile(file); // 중간 파일들 삭제하지 않음
          });
          console.log(`📁 중간 WebM 파일들 보존됨: ${validFiles.length}개`);
          resolve(outputFile);
        })
        .on("error", (err) => {
          console.log("MP3 병합 실패, AAC로 시도...");
          this.mergeToAAC(validFiles, outputFile.replace(".mp3", ".m4a"))
            .then((aacFile) => {
              validFiles.forEach((file) => {
                this.deleteFile(file); // 중간 파일들 삭제하지 않음
              });
              console.log(`📁 중간 WebM 파일들 보존됨: ${validFiles.length}개`);
              resolve(aacFile);
            })
            .catch(reject);
        })
        .save(outputFile);
    });
  }

  async mergeTwoFiles(file1, file2, outputBaseName) {
    const outputFile = path.join(
      config.directories?.recordings || "./recordings",
      `${outputBaseName}.mp3`
    );

    if (!(await fs.pathExists(file1)) || !(await fs.pathExists(file2))) {
      throw new Error("병합할 파일 중 하나가 존재하지 않습니다");
    }

    return new Promise((resolve, reject) => {
      console.log(
        `🔗 두 파일 병합 시작: ${path.basename(file1)} + ${path.basename(
          file2
        )}`
      );

      ffmpeg()
        .input(file1)
        .input(file2)
        .complexFilter(["[0:a][1:a]concat=n=2:v=0:a=1[outa]"])
        .outputOptions(["-map", "[outa]"])
        .audioCodec(config.audio?.defaultCodec || "libmp3lame")
        .audioBitrate(config.audio?.bitrate || "128k")
        .audioChannels(config.audio?.channels || 1)
        .audioFrequency(config.audio?.frequency || 44100)
        .on("end", () => {
          console.log(`✅ 두 파일 병합 완료: ${path.basename(outputFile)}`);
          console.log(
            `📁 원본 파일들 보존됨: ${path.basename(file1)}, ${path.basename(
              file2
            )}`
          );
          resolve(outputFile);
        })
        .on("error", (err) => {
          console.log("MP3 병합 실패, AAC로 시도...");
          this.mergeTwoFilesToAAC(file1, file2, outputBaseName)
            .then(resolve)
            .catch(reject);
        })
        .save(outputFile);
    });
  }

  async mergeTwoFilesToAAC(file1, file2, outputBaseName) {
    const outputFile = path.join(
      config.directories?.recordings || "./recordings",
      `${outputBaseName}.m4a`
    );

    return new Promise((resolve, reject) => {
      ffmpeg()
        .input(file1)
        .input(file2)
        .complexFilter(["[0:a][1:a]concat=n=2:v=0:a=1[outa]"])
        .outputOptions(["-map", "[outa]"])
        .audioCodec(config.audio?.fallbackCodec || "aac")
        .audioBitrate(config.audio?.bitrate || "128k")
        .on("end", () => {
          console.log(`✅ AAC 두 파일 병합 완료: ${path.basename(outputFile)}`);
          console.log(
            `📁 원본 파일들 보존됨: ${path.basename(file1)}, ${path.basename(
              file2
            )}`
          );
          resolve(outputFile);
        })
        .on("error", reject)
        .save(outputFile);
    });
  }

  async renameFile(oldPath, newBaseName) {
    const ext = path.extname(oldPath);
    const newPath = path.join(
      config.directories?.recordings || "./recordings",
      `${newBaseName}${ext}`
    );

    try {
      if (!(await fs.pathExists(oldPath))) {
        console.error(`원본 파일이 존재하지 않음: ${oldPath}`);
        return oldPath;
      }

      await fs.move(oldPath, newPath);
      console.log(
        `📝 파일 이름 변경: ${path.basename(oldPath)} → ${path.basename(
          newPath
        )}`
      );
      return newPath;
    } catch (error) {
      console.error("파일 이름 변경 실패:", error);
      return oldPath;
    }
  }

  // deleteFile 메서드는 유지하되, 자동 호출은 제거됨
  async deleteFile(filePath) {
    try {
      if (await fs.pathExists(filePath)) {
        await fs.remove(filePath);
        console.log(`🗑️ 파일 삭제: ${path.basename(filePath)}`);
      }
    } catch (error) {
      console.error(
        `파일 삭제 실패 (${path.basename(filePath)}):`,
        error.message
      );
    }
  }

  // 수동으로 임시 파일들을 정리하는 메서드 추가
  async cleanupTempFiles(meetingId) {
    try {
      const tempDir = config.directories?.temp || "./temp";
      const files = await fs.readdir(tempDir);
      const meetingFiles = files.filter((file) => file.startsWith(meetingId));

      console.log(
        `🧹 ${meetingId} 관련 임시 파일 정리: ${meetingFiles.length}개`
      );

      for (const file of meetingFiles) {
        const filePath = path.join(tempDir, file);
        await this.deleteFile(filePath);
      }
    } catch (error) {
      console.error("임시 파일 정리 실패:", error);
    }
  }

  convertToAAC(inputFile, outputFile) {
    return new Promise((resolve, reject) => {
      ffmpeg(inputFile)
        .audioCodec(config.audio?.fallbackCodec || "aac")
        .audioBitrate(config.audio?.bitrate || "128k")
        .audioChannels(config.audio?.channels || 1)
        .audioFrequency(config.audio?.frequency || 44100)
        .on("end", () => {
          console.log(`🎵 AAC 변환 완료: ${path.basename(outputFile)}`);
          resolve(outputFile);
        })
        .on("error", reject)
        .save(outputFile);
    });
  }

  mergeToAAC(webmFiles, outputFile) {
    return new Promise((resolve, reject) => {
      const command = ffmpeg();

      webmFiles.forEach((file) => {
        command.input(file);
      });

      const filterComplex =
        webmFiles.map((_, index) => `[${index}:a]`).join("") +
        `concat=n=${webmFiles.length}:v=0:a=1[outa]`;

      command
        .complexFilter(filterComplex)
        .outputOptions(["-map", "[outa]"])
        .audioCodec(config.audio?.fallbackCodec || "aac")
        .audioBitrate(config.audio?.bitrate || "128k")
        .on("end", () => {
          console.log(`🎵 AAC 병합 완료: ${path.basename(outputFile)}`);
          resolve(outputFile);
        })
        .on("error", reject)
        .save(outputFile);
    });
  }
}

module.exports = AudioProcessor;
