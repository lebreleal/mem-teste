import React, { Component, ErrorInfo, ReactNode } from "react";
import { logError } from "@/lib/errorLogger";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logError({
      message: error.message,
      stack: error.stack || "",
      component: errorInfo.componentStack || "ErrorBoundary",
      severity: "error",
      metadata: { componentStack: errorInfo.componentStack },
    });
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <div className="text-center max-w-md space-y-4">
            <AlertTriangle className="h-16 w-16 text-destructive mx-auto" />
            <h1 className="text-2xl font-bold text-foreground">
              Ops! Algo deu errado
            </h1>
            <p className="text-muted-foreground">
              Um erro inesperado aconteceu. O problema já foi registrado automaticamente.
            </p>
            <Button onClick={this.handleReload} size="lg">
              Recarregar página
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
