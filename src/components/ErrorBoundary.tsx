import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      let displayError = "Sema msee, something went wrong. Tafadhali jaribu tena.";
      try {
        const parsedError = JSON.parse(this.state.error?.message || '{}');
        if (parsedError.error && parsedError.error.includes('insufficient permissions')) {
          displayError = "Access denied. Please check your permissions or try logging in again.";
        } else if (parsedError.error) {
          displayError = parsedError.error;
        }
      } catch {
        displayError = this.state.error?.message || displayError;
      }

      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-[#f5f5f0] p-6 text-center">
          <div className="w-24 h-24 bg-[#BB0000] rounded-[32px] flex items-center justify-center mb-8 shadow-xl rotate-3">
            <span className="text-4xl text-white font-bold">!</span>
          </div>
          <h2 className="text-3xl font-bold text-[#1a1a1a] mb-4 font-sans">Eish! Something broke.</h2>
          <p className="text-[#006600]/70 max-w-md mb-8 font-serif italic text-lg">
            "{displayError}"
          </p>
          <button
            onClick={() => window.location.reload()}
            className="bg-[#006600] text-white px-8 py-3 rounded-2xl font-bold hover:bg-[#004d00] transition-all shadow-lg"
          >
            Jaribu Tena (Try Again)
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
