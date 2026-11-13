declare module "react-speech-recognition" {
	interface SpeechRecognition {
		startListening: (options?: {
			language?: string;
			continuous?: boolean;
		}) => void;
		stopListening: () => void;
		browserSupportsSpeechRecognition: () => boolean;
	}

	interface UseSpeechRecognitionResponse {
		transcript: string;
		listening: boolean;
		resetTranscript: () => void;
	}

	const SpeechRecognition: SpeechRecognition;
	export const useSpeechRecognition: () => UseSpeechRecognitionResponse;
	export default SpeechRecognition;
}
