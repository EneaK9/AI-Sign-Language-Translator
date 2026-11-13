import React from "react";
import signVideoMap from "../data/signVideoMap"; // Import dataset

const SignVideoPlayer: React.FC<{ text: string | null }> = ({ text }) => {
	if (!text) return null;

	const words = text.toLowerCase().split(" ");
	const matchedVideos = words
		.map((word) => signVideoMap[word])
		.filter((url) => url);

	return (
		<div className="mt-4">
			{matchedVideos.length > 0 ? (
				matchedVideos.map((videoSrc, index) => (
					<video
						key={index}
						src={videoSrc}
						controls
						autoPlay
						className="w-64 h-auto"
					/>
				))
			) : (
				<p className="text-red-500">Nuk ka video për këtë fjalë.</p>
			)}
		</div>
	);
};

export default SignVideoPlayer;
