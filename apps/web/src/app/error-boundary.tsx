import { Component, type ErrorInfo, type ReactNode } from 'react';
import i18next from '@/shared/i18n';
import { logger } from '@/shared/lib/logger';

interface ErrorBoundaryProps {
  readonly children: ReactNode;
}

interface ErrorBoundaryState {
  readonly hasError: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    logger.error(error.message, { stack: error.stack, componentStack: info.componentStack });
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false });
  };

  override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div role="alert">
          <h1>{i18next.t('errorBoundary.title')}</h1>
          <button type="button" onClick={this.handleRetry}>
            {i18next.t('errorBoundary.retry')}
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
