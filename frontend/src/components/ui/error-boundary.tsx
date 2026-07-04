import { Component, type ReactNode, type ErrorInfo } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="flex h-full w-full items-center justify-center bg-paper-2 border-[3px] border-ink p-6">
            <div className="text-center">
              <p className="font-mono text-sm text-stamp">INSTRUMENT UNAVAILABLE</p>
              <p className="font-body text-xs text-graphite mt-2">3D scene failed to load</p>
            </div>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
