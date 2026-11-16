type SpeechResult = { results: { [index: number]: { [index: number]: { transcript: string } } } };
type SpeechRecognizer = {
  lang: string;
  onresult: ((event: SpeechResult) => void) | null;
  onerror: (() => void) | null;
  start: () => void;
};

type SpeechWindow = Window & {
  SpeechRecognition?: new () => SpeechRecognizer;
  webkitSpeechRecognition?: new () => SpeechRecognizer;
};

export function canListen(): boolean {
  const host = window as SpeechWindow;
  return Boolean(host.SpeechRecognition || host.webkitSpeechRecognition);
}

export function listenAlbanian(): Promise<string> {
  const host = window as SpeechWindow;
  const Ctor = host.SpeechRecognition || host.webkitSpeechRecognition;
  if (!Ctor) return Promise.reject(new Error("Ky shfletues nuk njeh të folur. Përdor Chrome."));
  return new Promise((resolve, reject) => {
    const recognition = new Ctor();
    recognition.lang = "sq-AL";
    recognition.onresult = (event) => resolve(event.results[0][0].transcript);
    recognition.onerror = () => reject(new Error("Nuk u dëgjua. Provo përsëri."));
    recognition.start();
  });
}
