import React from "react";
import { Link } from "react-router-dom";

const HomePage: React.FC = () => {
	return (
		<div className="flex flex-col justify-center items-center h-screen bg-gray-100">
			<h1 className="text-4xl font-bold mb-4">AI Sign Language Translator</h1>
			<div className="space-x-4">
				<Link
					to="/speech-to-sign"
					className="bg-blue-500 text-white px-4 py-2 rounded">
					Speech to Sign
				</Link>
				<Link
					to="/keyboard"
					className="bg-green-500 text-white px-4 py-2 rounded">
					Sign Keyboard
				</Link>
			</div>
		</div>
	);
};

export default HomePage;
