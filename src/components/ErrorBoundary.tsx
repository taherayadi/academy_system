import React, { Component, type ReactNode, type ErrorInfo } from 'react';
import { clientLogger } from '../utils/logger';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public override state: State = { hasError: false, error: null };

  constructor(props: Props) {
    super(props);
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    clientLogger.error('React ErrorBoundary caught', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6" dir="rtl">
          <div className="bg-white rounded-2xl shadow-xl border border-red-200 p-8 max-w-lg w-full text-center space-y-4">
            <div className="text-4xl">⚠️</div>
            <h1 className="text-xl font-black text-slate-800">حدث خطأ غير متوقع</h1>
            <p className="text-sm text-slate-500 font-bold">
              يرجى إعادة تحميل الصفحة. إذا استمر الخطأ، تحقق من ملف السجل.
            </p>
            {this.state.error && (
              <pre className="text-xs text-red-600 bg-red-50 rounded-xl p-4 text-left overflow-auto max-h-40" dir="ltr">
                {this.state.error.message}
                {'\n'}
                {this.state.error.stack}
              </pre>
            )}
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-3 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700 transition"
            >
              إعادة تحميل الصفحة
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
