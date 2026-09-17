'use client';

import { QRCodeCanvas } from 'qrcode.react';

interface Props {
  url: string;
  size?: number;
}

export default function QRDisplay({ url, size = 256 }: Props) {
  const downloadQR = () => {
    const canvas = document.getElementById('review-qr') as HTMLCanvasElement;
    if (!canvas) return;
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = 'reviewiq-qr.png';
    link.click();
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="p-4 bg-white border border-gray-200 rounded-2xl shadow-sm">
        <QRCodeCanvas
          id="review-qr"
          value={url}
          size={size}
          bgColor="#FFFFFF"
          fgColor="#16A34A"
          level="H"
          includeMargin={false}
        />
      </div>
      <button
        onClick={downloadQR}
        className="px-6 py-2 bg-green-600 text-white text-sm rounded-xl font-medium hover:bg-green-700 transition-colors"
      >
        Download PNG
      </button>
    </div>
  );
}