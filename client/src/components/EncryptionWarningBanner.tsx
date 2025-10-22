// client/src/components/EncryptionWarningBanner.tsx
import React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle, Info, X } from 'lucide-react';
import { EncryptionWarning } from '../hooks/useEncryptionWarning';

interface EncryptionWarningBannerProps {
  warning: EncryptionWarning;
  onClose: () => void;
}

export function EncryptionWarningBanner({ warning, onClose }: EncryptionWarningBannerProps) {
  const iconMap = {
    success: CheckCircle,
    warning: AlertTriangle,
    error: AlertCircle,
    info: Info,
  };

  const colorMap = {
    success: {
      bg: 'bg-green-50',
      border: 'border-green-200',
      text: 'text-green-800',
      icon: 'text-green-600',
    },
    warning: {
      bg: 'bg-yellow-50',
      border: 'border-yellow-200',
      text: 'text-yellow-800',
      icon: 'text-yellow-600',
    },
    error: {
      bg: 'bg-red-50',
      border: 'border-red-200',
      text: 'text-red-800',
      icon: 'text-red-600',
    },
    info: {
      bg: 'bg-blue-50',
      border: 'border-blue-200',
      text: 'text-blue-800',
      icon: 'text-blue-600',
    },
  };

  const Icon = iconMap[warning.type];
  const colors = colorMap[warning.type];

  return (
    <div className={`rounded-lg border ${colors.bg} ${colors.border} p-4 mb-4`}>
      <div className="flex items-start gap-3">
        <Icon className={`w-5 h-5 ${colors.icon} mt-0.5 flex-shrink-0`} />
        <div className="flex-1">
          <h3 className={`font-semibold ${colors.text} mb-1`}>{warning.title}</h3>
          <p className={`text-sm ${colors.text} whitespace-pre-wrap`}>{warning.message}</p>
          {warning.type === 'error' && (
            <div className="mt-3 p-3 bg-white bg-opacity-50 rounded border border-current border-opacity-20">
              <p className={`text-xs font-mono ${colors.text}`}>
                Blob ID: {warning.blobId}
              </p>
              <p className={`text-xs ${colors.text} mt-2`}>
                💡 <strong>Tip:</strong> Use the CLI for encrypted files:
              </p>
              <code className={`text-xs ${colors.text} block mt-1`}>
                npx tsx src/scripts/index.ts check {warning.blobId}
              </code>
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          className={`${colors.text} hover:opacity-70 transition`}
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
