import express from "express";
import multer from "multer";
import { exec } from "child_process";
import fs from "fs";
import path from "path";

const router = express.Router();
const upload = multer({ dest: "uploads/" });

router.post("/", upload.single("audio"), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "No audio file uploaded" });

        const audioPath = path.resolve(req.file.path);
        console.log("✅ Processing audio file:", audioPath);

        // Run Whisper locally
        exec(`whisper ${audioPath} --language Albanian --model medium`, (error, stdout, stderr) => {
            if (error) {
                console.error("❌ Whisper Error:", stderr);
                return res.status(500).json({ error: "Whisper failed", details: stderr });
            }

            // Extract transcribed text from stdout
            const result = stdout.trim();
            console.log("✅ Transcription:", result);

            res.json({ text: result });
        });

    } catch (error) {
        console.error("❌ Error transcribing audio:", error.message);
        res.status(500).json({ error: "Failed to transcribe audio", details: error.message });
    }
});

export default router;
