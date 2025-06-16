const axios = require("axios");
const URL = "https://9msjgfcsbe.execute-api.us-east-1.amazonaws.com/stage";
const path = require("path");
const fs = require("fs-extra");

const uploadFileMiddle = async (filePath, customKey = null) => {
  try {
    // 파일 정보 추출
    const fileName = path.basename(filePath);
    const date = new Date().getMilliseconds();
    const s3Key = `intermediate%2F${date}middle.mp3`;

    // 파일을 Buffer로 읽기
    const fileBuffer = await fs.promises.readFile(filePath);

    // Content-Type 결정
    const getContentType = (filePath) => {
      const ext = path.extname(filePath).toLowerCase();
      switch (ext) {
        case ".mp3":
          return "audio/mpeg";
        case ".m4a":
          return "audio/mp4";
        case ".webm":
          return "audio/webm";
        case ".wav":
          return "audio/wav";
        case ".pdf":
          return "application/pdf";
        default:
          return "application/octet-stream";
      }
    };

    const response = await axios.put(
      `${URL}/inha-pj-05-jeh/${s3Key}`,
      fileBuffer,
      {
        headers: {
          "Content-Type": getContentType(filePath),
          "Content-Length": fileBuffer.length,
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        timeout: 30000,
      }
    );

    console.log(`✅ 파일 업로드 성공: ${s3Key}`);
    return {
      s3Url: `s3://inha-pj-05-jeh/${s3Key}`,
      httpUrl: `https://inha-pj-05-jeh.s3.amazonaws.com/${s3Key}`,
      response: response.data,
    };
  } catch (error) {
    console.error("Error uploading file:", error);
    if (error.response) {
      console.error(`HTTP Status: ${error.response.status}`);
      console.error(`Response:`, error.response.data);
    }
    throw error;
  }
};
const uploadFileFinal = async (filePath, customKey = null) => {
  try {
    // 파일 정보 추출
    const fileName = path.basename(filePath);
    const date = new Date().getMilliseconds();
    const s3Key = `final%2F${date}.mp3`;

    // 파일을 Buffer로 읽기
    const fileBuffer = await fs.promises.readFile(filePath);

    // Content-Type 결정
    const getContentType = (filePath) => {
      const ext = path.extname(filePath).toLowerCase();
      switch (ext) {
        case ".mp3":
          return "audio/mpeg";
        case ".m4a":
          return "audio/mp4";
        case ".webm":
          return "audio/webm";
        case ".wav":
          return "audio/wav";
        case ".pdf":
          return "application/pdf";
        default:
          return "application/octet-stream";
      }
    };

    const response = await axios.put(
      `${URL}/inha-pj-05-jeh/${s3Key}`,
      fileBuffer,
      {
        headers: {
          "Content-Type": getContentType(filePath),
          "Content-Length": fileBuffer.length,
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        timeout: 30000,
      }
    );

    console.log(`✅ 파일 업로드 성공: ${s3Key}`);
    return {
      s3Url: `s3://inha-pj-05-jeh/${s3Key}`,
      httpUrl: `https://inha-pj-05-jeh.s3.amazonaws.com/${s3Key}`,
      response: response.data,
    };
  } catch (error) {
    console.error("Error uploading file:", error);
    if (error.response) {
      console.error(`HTTP Status: ${error.response.status}`);
      console.error(`Response:`, error.response.data);
    }
    throw error;
  }
};

const getPDF = async () => {
  try {
    const meetingId = "job002";
    console.log(`📄 PDF API 호출: ${meetingId}`);
    const response = await axios.get(`${URL}/meetingInfo/${meetingId}/getPdf`);
    console.log(`✅ PDF API 응답 성공`);
    return response.data;
  } catch (error) {
    console.error("Error fetching PDF:", error);
    throw error;
  }
};

const getMeetingInfo = async () => {
  const meetingId = "job002";
  try {
    const response = await axios.get(
      `${URL}/meetingInfo/${meetingId}/getSummary/latest`
    );
    return response.data;
  } catch (error) {
    console.error("Error fetching meeting info:", error);
    throw error;
  }
};

// CommonJS 방식으로 내보내기
module.exports = {
  uploadFileMiddle, // Node.js용
  uploadFileFinal,
  getPDF,
  getMeetingInfo,
};
