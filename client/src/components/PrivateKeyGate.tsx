import { useNavigate } from "react-router-dom";
import { KeyRound, Lock, Waves, Shield, AlertCircle } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";

export default function PrivateKeyGate() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  // With E2E encryption, the key is derived during login
  // If user is not authenticated, redirect to login
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-cyan-50 via-blue-50 to-indigo-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-800">
        {/* Header */}
        <header className="border-b border-blue-200/50 bg-white/80 backdrop-blur-lg dark:border-slate-700 dark:bg-slate-900/80">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex h-16 items-center justify-center">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 shadow-lg">
                  <Waves className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold bg-gradient-to-r from-cyan-600 to-blue-600 bg-clip-text text-transparent dark:from-cyan-400 dark:to-blue-400">
                    Walrus Storage
                  </h1>
                  <p className="text-xs text-muted-foreground">Decentralized File Storage</p>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-lg items-center px-4 py-8">
          <Card className="w-full border-blue-200/50 bg-gradient-to-br from-white to-blue-50/30 shadow-2xl dark:from-slate-900 dark:to-slate-800">
            <CardHeader className="space-y-4">
              <div className="flex justify-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 shadow-lg">
                  <KeyRound className="h-8 w-8 text-white" />
                </div>
              </div>
              <div className="text-center">
                <CardTitle className="text-2xl">Authentication Required</CardTitle>
                <CardDescription className="mt-2">
                  Please log in to access your encrypted files
                </CardDescription>
              </div>
            </CardHeader>

            <CardContent className="space-y-6">
              {/* Security Notice */}
              <div className="rounded-lg border-2 border-dashed border-blue-300/50 bg-blue-50/50 p-4 dark:border-blue-700/50 dark:bg-blue-950/20">
                <div className="flex gap-3">
                  <Shield className="h-5 w-5 flex-shrink-0 text-cyan-600 dark:text-cyan-400" />
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      End-to-End Encrypted
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Your encryption key is derived from your password and <span className="font-semibold text-cyan-600 dark:text-cyan-400">never stored on our servers</span>. Only you can access your files.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-400">
                <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span>Your session has expired. Please log in again to continue.</span>
              </div>

              <div className="space-y-2">
                <Button
                  onClick={() => navigate('/login')}
                  className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700"
                  size="lg"
                >
                  <Lock className="mr-2 h-4 w-4" />
                  Go to Login
                </Button>
                
                <Button
                  onClick={() => navigate('/recover')}
                  variant="outline"
                  className="w-full"
                  size="lg"
                >
                  Use Recovery Phrase
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // User is authenticated, don't render anything (this component shouldn't be visible)
  return null;
}
              </Button>
            </form>

            {/* Help Text */}
            <div className="rounded-lg bg-gray-50 p-3 dark:bg-slate-900/50">
              <p className="text-xs text-muted-foreground">
                <span className="font-semibold">Need help?</span> Your private key should be a 64-character hexadecimal string (optionally prefixed with 0x).
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Footer */}
      <footer className="border-t border-blue-200/50 bg-white/50 backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/50">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <p className="text-center text-xs text-muted-foreground">
            Powered by Walrus & Sui • Secure Decentralized Storage
          </p>
        </div>
      </footer>
    </div>
  );
}
