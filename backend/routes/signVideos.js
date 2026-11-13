import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const router = express.Router();

// Fix for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const VIDEO_DIR = path.join(__dirname, "../sign-language-dataset");

// Endpoint to list available videos
router.get("/list", (req, res) => {
    fs.readdir(VIDEO_DIR, (err, files) => {
        if (err) return res.status(500).json({ error: "Failed to read videos" });
        res.json({ videos: files });
    });
});

// Endpoint to stream a video
router.get("/:filename", (req, res) => {
    const videoPath = path.join(VIDEO_DIR, req.params.filename);
    if (!fs.existsSync(videoPath)) return res.status(404).json({ error: "Video not found" });

    res.sendFile(videoPath);
});

export default router;
