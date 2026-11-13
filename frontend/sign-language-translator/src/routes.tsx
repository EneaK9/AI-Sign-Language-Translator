import React from "react";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import HomePage from "./pages/HomePage";
import SpeechToSignPage from "./pages/SpeechToSignPage";
import KeyboardPage from "./pages/KeyboardPage";

const AppRoutes: React.FC = () => {
	return (
		<Router>
			<Routes>
				<Route path="/" element={<HomePage />} />
				<Route path="/speech-to-sign" element={<SpeechToSignPage />} />
				<Route path="/keyboard" element={<KeyboardPage />} />
			</Routes>
		</Router>
	);
};

export default AppRoutes;
