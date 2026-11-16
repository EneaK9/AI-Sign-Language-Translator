import { BrowserRouter, Route, Routes } from "react-router";
import { Shell } from "./components/Shell";
import { AlphabetPage } from "./pages/AlphabetPage";
import { ClipPage } from "./pages/ClipPage";
import { DictionaryPage } from "./pages/DictionaryPage";
import { FingerspellPage } from "./pages/FingerspellPage";
import { HomePage } from "./pages/HomePage";
import { ImportPage } from "./pages/ImportPage";
import { KeyboardPage } from "./pages/KeyboardPage";
import { MirrorPage } from "./pages/MirrorPage";
import { RecordPage } from "./pages/RecordPage";
import { RigPage } from "./pages/RigPage";
import { SignPage } from "./pages/SignPage";
import { StudioPage } from "./pages/StudioPage";
import { TranslatePage } from "./pages/TranslatePage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<HomePage />} />
          <Route path="alphabet" element={<AlphabetPage />} />
          <Route path="fingerspell" element={<FingerspellPage />} />
          <Route path="keyboard" element={<KeyboardPage />} />
          <Route path="dictionary" element={<DictionaryPage />} />
          <Route path="sign/:id" element={<SignPage />} />
          <Route path="translate" element={<TranslatePage />} />
          <Route path="studio" element={<StudioPage />} />
          <Route path="studio/record" element={<RecordPage />} />
          <Route path="studio/import" element={<ImportPage />} />
          <Route path="lab/rig" element={<RigPage />} />
          <Route path="lab/mirror" element={<MirrorPage />} />
          <Route path="lab/clip" element={<ClipPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
