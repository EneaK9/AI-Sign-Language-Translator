import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import speechToTextRoutes from "./routes/speechToText.js";
import textToSpeechRoutes from "./routes/textToSpeech.js";
import signVideosRoutes from "./routes/signVideos.js";

dotenv.config();
const app = express();

app.use(cors());
app.use(express.json());

// API Endpoints
app.use("/api/speech-to-text", speechToTextRoutes);
app.use("/api/text-to-speech", textToSpeechRoutes);
app.use("/api/sign-videos", signVideosRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
