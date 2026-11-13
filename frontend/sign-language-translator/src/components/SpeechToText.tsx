import React, { useState } from "react";
import SpeechRecognition, { useSpeechRecognition } from "react-speech-recognition";

const SpeechToText: React.FC<{ onTranscribe: (text: string) => void }> = ({ onTranscribe }) => {
  const { transcript, listening, resetTranscript } = useSpeechRecognition();
  const [isRecording, setIsRecording] = useState(false);

  

  const startListening = () => {
    resetTranscript();
    SpeechRecognition.startListening({ language: "sq-AL", continuous: true });
    setIsRecording(true);
  };

  const stopListening = () => {
    SpeechRecognition.stopListening();
    setIsRecording(false);
    onTranscribe(transcript); // Send transcribed text to parent component
  };

  return (
    <div className="flex flex-col items-center space-y-4">
      
      {transcript && <p className="mt-4 text-lg font-semibold">Speech: {transcript}</p>}
    </div>
  );
};

export default SpeechToText;
