interface ConsentScreenProps {
  onAccept: () => void;
}

export function ConsentScreen({ onAccept }: ConsentScreenProps) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-paper p-6">
      <div className="w-full max-w-md border-[3px] border-ink bg-paper-2 p-6">
        <h1 className="font-display text-xl uppercase tracking-[0.08em] text-ink mb-4">Data Collection</h1>
        <p className="font-body text-sm text-graphite mb-4 leading-relaxed">
          You'll perform 8 quick webcam tasks (~3 minutes total). Your face landmarks
          (eye movements, head poses) will be recorded and used to improve ProctorIQ's
          attention classifier.
        </p>
        <ul className="font-body text-xs text-graphite mb-4 grid gap-1.5">
          <li>No video leaves your device — only movement patterns are saved</li>
          <li>Data is anonymized and never shared with third parties</li>
          <li>You can stop at any time</li>
        </ul>
        <button
          onClick={onAccept}
          className="w-full border-[3px] border-ink bg-ink px-4 py-3 font-display text-sm uppercase tracking-[0.08em] text-paper hover:bg-paper hover:text-ink transition-colors"
        >
          I Consent — Begin
        </button>
      </div>
    </div>
  );
}
