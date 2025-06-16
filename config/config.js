const path = require("path");

module.exports = {
  server: {
    port: process.env.PORT || 443,
    host: process.env.HOST || "localhost",
  },

  directories: {
    recordings: path.join(__dirname, "..", "recordings"),
    temp: path.join(__dirname, "..", "temp"),
    public: path.join(__dirname, "..", "public"),
  },

  audio: {
    defaultCodec: "libmp3lame",
    fallbackCodec: "aac",
    bitrate: "128k",
    channels: 1,
    frequency: 44100,
  },

  meeting: {
    autoStartRecording: true,
    autoStartMode: "first_participant",
    maxParticipants: 10,
    autoEndTimeout: 300000,
  },

  websocket: {
    pingInterval: 30000,
    pongTimeout: 5000,
  },
};
