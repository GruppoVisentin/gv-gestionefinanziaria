import React, { useState } from 'react';
import { FileDown } from 'lucide-react';
import { esportaPDF, PDFReportConfig } from '../utils/pdfExport';

interface PDFExportButtonProps {
  config: PDFReportConfig;
  label?: string;        // default "Esporta PDF"
  variant?: 'primary' | 'outline';  // default outline
  className?: string;
}

const PDFExportButton: React.FC<PDFExportButtonProps> = ({
  config,
  label = 'Esporta PDF',
  variant = 'outline',
  className = '',
}) => {
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    setLoading(true);
    await esportaPDF(config);
    setLoading(false);
  };

  const baseClass = `
    flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold
    transition-all active:scale-95
  `;
  const variantClass = variant === 'primary'
    ? 'bg-[#222222] text-white hover:bg-slate-800 shadow-md'
    : 'border-2 border-slate-200 text-slate-600 hover:border-slate-400 hover:text-slate-800';

  return (
    <button
      onClick={handleExport}
      disabled={loading}
      className={`${baseClass} ${variantClass} ${loading ? 'opacity-50 cursor-wait' : ''} ${className}`}
      title={`Esporta ${config.titolo} in PDF`}
    >
      <FileDown size={16} />
      {loading ? 'Generazione...' : label}
    </button>
  );
};

export default PDFExportButton;
