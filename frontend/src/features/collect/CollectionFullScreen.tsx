export function CollectionFullScreen() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-paper p-6">
      <div className="w-full max-w-md border-[3px] border-ink bg-paper-2 p-6 text-center">
        <h1 className="font-display text-xl uppercase tracking-[0.08em] text-ink mb-2">Collection Full</h1>
        <p className="font-body text-sm text-graphite leading-relaxed">
          We've reached our contributor limit. Thank you for your interest!
        </p>
      </div>
    </div>
  );
}
