import React, { useState } from "react";
import { signAlphabet } from "../data/signAlphabet";

const SignLanguageAlphabetKeyboard: React.FC<{
	onSubmit: (message: string) => void;
}> = ({ onSubmit }) => {
	const [message, setMessage] = useState<string>("");

	const handleClick = (letter: string) => {
		setMessage((prev) => prev + letter);
	};
  const handleClear = () => {
		setMessage(""); // Reset the input
	};

	return (
		<div className="flex flex-col items-center space-y-4">
			<div className="grid grid-cols-6 gap-2">
				{signAlphabet.map(({ symbol, letter }) => (
					<button
						key={letter}
						onClick={() => handleClick(letter)}
						className="px-4 py-2 text-xl bg-gray-200 rounded hover:bg-gray-300 transition">
						{symbol}
					</button>
				))}
			</div>
			<p className="mt-4 text-lg font-semibold">
				{message}
			</p>
			<button
				onClick={() => onSubmit(message)}
				className="mt-2 px-6 py-2 bg-blue-500 text-white rounded"
				disabled={!message}>
				Dërgo
			</button>
			<button
				onClick={handleClear}
				className="px-6 py-2 bg-gray-400 text-white rounded"
				disabled={!message}>
				Pastro
			</button>
		</div>
	);
};

export default SignLanguageAlphabetKeyboard;
