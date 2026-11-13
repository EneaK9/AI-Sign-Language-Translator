import React, { useRef } from "react";
import axios from "axios";
import SignLanguageAlphabetKeyboard from "../components/SignLanguageAlphabetKeyboard";
import { useNavigate } from "react-router-dom";

const KeyboardPage: React.FC = () => {
	const audioRef = useRef<HTMLAudioElement | null>(new Audio());
	const navigate = useNavigate();

	const handleSubmit = async (translatedText: string) => {
		try {
			const response = await axios.get(
				`http://localhost:5000/api/text-to-speech?text=${encodeURIComponent(
					translatedText
				)}`
			);
			const audioUrl = response.data.audioUrl;

			if (audioUrl && audioRef.current) {
				audioRef.current.src = audioUrl;
				audioRef.current
					.play()
					.catch((error) => console.error("Playback error:", error));
			}
		} catch (error: any) {
			console.error("❌ Error generating speech:", error.message);
		}
	};


	return (
		<div className="flex flex-col items-center justify-center h-screen bg-gray-100">
			<h1 className="text-3xl font-bold mb-4">AI Sign Language Keyboard</h1>
			<SignLanguageAlphabetKeyboard onSubmit={handleSubmit} />
			<button
				onClick={() => navigate("/")}
				className="mt-6 px-6 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition">
				Kthehu
			</button>
		</div>
	);
};

export default KeyboardPage;
