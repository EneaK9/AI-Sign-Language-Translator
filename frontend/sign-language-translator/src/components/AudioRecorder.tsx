import React, { useState } from "react";
import { ReactMic } from "react-mic";

const AudioRecorder: React.FC<{ onStop: (blob: Blob) => void }> = ({
	onStop,
}) => {
	const [recording, setRecording] = useState(false);

	const startRecording = () => setRecording(true);
	const stopRecording = () => setRecording(false);

	return (
		<div className="flex flex-col items-center space-y-4">
			<ReactMic
				record={recording}
				className="w-64 h-16 bg-gray-300"
				onStop={(recordedData) => onStop(recordedData.blob)}
				strokeColor="#000000"
				backgroundColor="#f3f4f6"
			/>
			<div className="flex space-x-4">
				<button
					onClick={startRecording}
					className="px-6 py-2 bg-blue-500 text-white rounded">
					Start Recording
				</button>
				<button
					onClick={stopRecording}
					className="px-6 py-2 bg-red-500 text-white rounded">
					Stop Recording
				</button>
			</div>
		</div>
	);
};

export default AudioRecorder;
