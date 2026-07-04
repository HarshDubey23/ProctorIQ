export function ThankYouScreen() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-paper p-6">
      <div className="w-full max-w-md border-[3px] border-ink bg-paper-2 p-6 text-center">
        <h1 className="font-display text-xl uppercase tracking-[0.08em] text-ink mb-2">Thank You!</h1>
        <p className="font-body text-sm text-graphite leading-relaxed">
          Your contribution helps make ProctorIQ more accurate and fair.
        </p>
      </div>
    </div>
  );
}
