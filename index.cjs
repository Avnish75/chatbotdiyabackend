const { exec } = require("child_process");
const cors = require("cors");
const dotenv = require("dotenv");
const express = require("express");
const fs = require("fs").promises;
const path = require("path");
const fetch = require("node-fetch");
const gTTS = require("gtts");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegInstaller = require("@ffmpeg-installer/ffmpeg");

dotenv.config();

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const app = express();
app.use(express.json());
app.use(cors());

const port = 3000;

const TOGETHER_API_KEY = "c633bbae018ed9f7d090c34f028137619dda0e088dcb425732b14346cac569a8";
const TOGETHER_MODEL = "meta-llama/Llama-3.3-70B-Instruct-Turbo-Free";
const RHUBARB_PATH = "C:\\Users\\avnis\\OneDrive\\Desktop\\Doctor\\Rhubarb-Lip-Sync-1.14.0-Windows\\rhubarb.exe";

// Convert audio file to base64
const audioFileToBase64 = async (file) => {
  const data = await fs.readFile(file);
  return data.toString("base64");
};

// Convert mp3 to wav using ffmpeg
const convertMp3ToWav = (mp3Path, wavPath) => {
  return new Promise((resolve, reject) => {
    ffmpeg(mp3Path)
      .output(wavPath)
      .on("end", resolve)
      .on("error", reject)
      .run();
  });
};

// Generate lipsync JSON from wav using Rhubarb
const generateLipsyncFromWav = async (wavPath, jsonPath) => {
  const command = `"${RHUBARB_PATH}" "${wavPath}" -o "${jsonPath}" -f json`;
  return new Promise((resolve, reject) => {
    exec(command, async (err) => {
      if (err) {
        console.error("Rhubarb error:", err);
        return reject(err);
      }

      try {
        const jsonStr = await fs.readFile(jsonPath, "utf-8");
        const { mouthCues } = JSON.parse(jsonStr);
        resolve({ mouthCues });
      } catch (e) {
        reject(e);
      }
    });
  });
};

app.post("/chat", async (req, res) => {
  try {
    const userMessage = req.body.message || "Hello";

    const systemPrompt = `You are assistant Diya, a helpful, friendly, and gentle 3D virtual doctor assistant. 
Help users in simple language, avoid complex medical terms, and also keep the conversation warm and
supportive and give small answers.
You are part of a chatbot created by Aayu sync . Reply like wise with kindness and polite responses.
Rules
-replies should be shorter then usual
-keep your humour alive dont be serious`;


    const response = await fetch("https://api.together.xyz/inference", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TOGETHER_API_KEY}`,
      },
      body: JSON.stringify({
        model: TOGETHER_MODEL,
        prompt: `System: ${systemPrompt}\nUser: ${userMessage}\nAssistant:`,
        max_tokens: 500,
        temperature: 0.6,
        top_p: 0.9,
        stop: ["User:", "System:"],
      }),
    });

    const data = await response.json();
    const text = data.output?.choices?.[0]?.text?.trim() || "Sorry, I didn’t get that.";

    const message = {
      text,
      facialExpression: "smile",
      animation: "Talking_1",
    };

    // Make sure temp directories exist!
    await fs.mkdir("audios", { recursive: true });
    await fs.mkdir("temp", { recursive: true });

    // File paths
    const mp3Path = path.join("audios", "message_0.mp3");
    const wavPath = path.join("temp", "message_0.wav");
    const jsonPath = path.join("temp", "message_0.json");

    //get gtts from here
    const gtts = new gTTS(text, "en");
    await new Promise((resolve, reject) => {
      gtts.save(mp3Path, function (err) {
        if (err) reject(err);
        else resolve();
      });
    });

    // Convert mp3 to wav
    await convertMp3ToWav(mp3Path, wavPath);

    // Generate lipsync data from wav
    const lipsync = await generateLipsyncFromWav(wavPath, jsonPath);

    // Attach audio base64 and lipsync info to message
    message.audio = await audioFileToBase64(mp3Path);
    message.lipsync = lipsync;

    res.send({ messages: [message] });
  } catch (err) {
    console.error("Error in /chat:", err);
    res.status(500).send({ error: "Internal Server Error" });
  }
});

app.listen(port, () => {
  console.log(`Dr. Diya Assistant backend running on port ${port}`);
});
