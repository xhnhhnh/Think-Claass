import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

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
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in component tree:', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleGoHome = () => {
    window.location.href = '/';
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 font-sans">
          <div className="bg-white/80 backdrop-blur-xl p-8 rounded-3xl shadow-xl max-w-md w-full text-center border border-red-100">
            <div className="mx-auto flex justify-center items-center h-16 w-16 rounded-full bg-red-100 mb-6">
              <AlertTriangle className="h-8 w-8 text-red-500" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">哎呀，页面遇到了一点小问题</h1>
            <p className="text-gray-500 mb-8 text-sm">
              我们在处理您的请求时遇到了一些异常，但这不会影响您的数据。
            </p>
            
            <div className="flex flex-col space-y-3">
              <button
                onClick={this.handleReload}
                className="w-full flex justify-center items-center px-4 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors shadow-sm font-medium"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                重新加载页面
              </button>
              <button
                onClick={this.handleGoHome}
                className="w-full flex justify-center items-center px-4 py-3 bg-white text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors shadow-sm font-medium"
              >
                <Home className="w-4 h-4 mr-2" />
                返回首页
              </button>
            </div>
            
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <div className="mt-8 text-left bg-gray-100 p-4 rounded-xl overflow-auto text-xs text-red-600 font-mono max-h-40">
                {this.state.error.toString()}
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
