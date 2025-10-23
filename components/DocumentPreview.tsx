import React from 'react';
import { FileText, File, Download } from 'lucide-react';

interface DocumentPreviewProps {
  fileName?: string;
  fileType?: string;
  onDownload?: () => void;
}

export default function DocumentPreview({ fileName, fileType, onDownload }: DocumentPreviewProps) {
  const getFileIcon = () => {
    if (!fileType) return <File className="w-16 h-16" />;

    if (fileType === 'application/pdf' || fileType.includes('pdf')) {
      return <FileText className="w-16 h-16" />;
    } else if (fileType.includes('text') || fileType.includes('document')) {
      return <FileText className="w-16 h-16" />;
    } else {
      return <File className="w-16 h-16" />;
    }
  };

  const getFileTypeName = () => {
    if (!fileType) return 'Document';

    if (fileType === 'application/pdf' || fileType.includes('pdf')) {
      return 'PDF Document';
    } else if (fileType === 'text/plain' || fileType.startsWith('text/')) {
      return 'Text Document';
    } else if (fileType.includes('document')) {
      return 'Document';
    } else {
      return 'File';
    }
  };

  return (
    <div className="bg-zinc-100 border-4 border-zinc-900 p-8 mb-8">
      <div className="flex items-center gap-6">
        <div className="flex-shrink-0 text-zinc-700">
          {getFileIcon()}
        </div>
        <div className="flex-1">
          <div className="text-sm font-black uppercase text-zinc-500 mb-1">
            {getFileTypeName()}
          </div>
          <div className="text-lg font-bold text-zinc-900 mb-3">
            {fileName || 'Untitled Document'}
          </div>
          {onDownload && (
            <button
              onClick={onDownload}
              aria-label={`Download ${fileName || 'document'}`}
              className="flex items-center gap-2 bg-zinc-900 text-white px-4 py-2 font-black uppercase text-sm hover:bg-zinc-800 transition-colors border-2 border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:ring-offset-2"
            >
              <Download className="w-4 h-4" />
              Download Document
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
