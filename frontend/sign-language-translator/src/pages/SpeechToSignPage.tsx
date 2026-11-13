import React, { useState } from "react";
import SpeechRecorder from "../components/AudioRecorder";
import axios from "axios";

const SpeechToSignPage: React.FC = () => {
	const [transcription, setTranscription] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [videoUrl, setVideoUrl] = useState<string | null>(null);

	const handleAudioStop = async (blob: Blob) => {
		setLoading(true);
		const formData = new FormData();
		formData.append("audio", blob, "recording.wav");

		try {
			const response = await axios.post(
				"http://localhost:5000/api/speech-to-text",
				formData
			);
			const text = response.data.text;
			setTranscription(text);

			// Request sign language video from backend
			const videoResponse = await axios.get(
				`http://localhost:5000/api/sign-videos?word=${text}`
			);
			setVideoUrl(videoResponse.data.videoUrl);
		} catch (error) {
			console.error("Error transcribing audio:", error);
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="flex flex-col items-center justify-center h-screen bg-gray-100">
			<h1 className="text-3xl font-bold mb-4">Speech to Sign Translation</h1>
			<SpeechRecorder onStop={handleAudioStop} />
			{loading && <p className="mt-4 text-blue-500">Processing...</p>}
			{transcription && (
				<p className="mt-4 text-lg font-semibold">You said: {transcription}</p>
			)}
			{videoUrl && (
				<video src={videoUrl} controls autoPlay className="mt-4 w-64 h-auto" />
			)}
		</div>
	);
};

export default SpeechToSignPage;
