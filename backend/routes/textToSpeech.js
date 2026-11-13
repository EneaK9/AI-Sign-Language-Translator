import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();
const router = express.Router();

const AIVOOV_API_KEY = process.env.AIVOOV_API_KEY;
const AIVOOV_VOICE = "anila";  

router.get("/", async (req, res) => {
    const { text } = req.query;
    if (!text) return res.status(400).json({ error: "Text parameter is required" });

    try {
        const response = await axios.post("https://aivoov.com/api/v1/tts", {
            voice: AIVOOV_VOICE,
            text: text,
            speed: 1.0,
            format: "mp3"
        }, {
            headers: { "Authorization": `Bearer ${AIVOOV_API_KEY}` }
        });

        if (!response.data.audioUrl) throw new Error("Invalid response from Aivoov API");

        const audioUrl = response.data.audioUrl;
        res.json({ audioUrl });

    } catch (error) {
        console.error("❌ Aivoov API Error:", error.message);
        res.status(500).json({ error: "Failed to generate speech", details: error.message });
    }
});

export default router;
