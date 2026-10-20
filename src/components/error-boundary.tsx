"use client";

import { Component, type ReactNode } from "react";
import { BeyuOsLogo } from "./beyu-os-logo";

/**
 * Client error boundary with safe recovery.
 * Never leaks stack traces, secrets, or DB details to user.
 */
type Props = { children: ReactNode; fallbackTitle?: string };
type State = { hasError: boolean; id?: string };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true, id: `err_${Date.now().toString(36)}` };
  }

  componentDidCatch() {
    // intentionally minimal — real logging is server-side
  }

  render() {
    if (this.state.hasError) {
      return (
        <div role="alert" className="beyu-panel mx-auto max-w-lg p-6 text-center">
          <BeyuOsLogo size={40} ariaLabel="BEYU OS" />
          <h2 className="mt-3 text-[16px] font-semibold">Something went wrong</h2>
          <p className="mt-2 text-[12.5px] beyu-muted">
            This section could not be loaded. No data was changed. Try again, or return to the dashboard.
          </p>
          {this.state.id && <p className="mt-2 text-[11px] beyu-muted">Reference: <span className="font-mono">{this.state.id}</span></p>}
          <div className="mt-4 flex justify-center gap-2">
            <button
              type="button"
              onClick={() => this.setState({ hasError: false })}
              className="min-h-10 rounded-lg border px-4 text-[12px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              Try again
            </button>
            <a href="/os" className="inline-flex min-h-10 items-center rounded-lg bg-[#0B1F4D] px-4 text-[12px] font-semibold text-white">
              Back to dashboard
            </a>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
