import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Smartphone } from 'lucide-react';
import { healthApi } from '../services/api';

export const MobileQrCard: React.FC = () => {
  const [mobileUrl, setMobileUrl] = useState<string>(window.location.origin);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  useEffect(() => {
    let active = true;
    healthApi
      .check()
      .then((h) => {
        if (!active) return;
        const url = h.mobileUrl || window.location.origin;
        setMobileUrl(url);
      })
      .catch(() => {
        if (active) setMobileUrl(window.location.origin);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!mobileUrl) return;
    QRCode.toDataURL(mobileUrl, {
      width: 168,
      margin: 2,
      color: {
        dark: '#101010',
        light: '#FACC15',
      },
    })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(''));
  }, [mobileUrl]);

  return (
    <div className="sr-card flex flex-wrap items-center justify-between gap-4 p-5">
      <div className="max-w-lg space-y-1.5">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#FACC15]">
          <Smartphone className="h-4 w-4" />
          Mobile Phone Wi-Fi Access
        </div>
        <h3 className="text-sm font-semibold text-[#F5F5F5]">
          Scan QR Code on Same Local Wi-Fi Network
        </h3>
        <p className="text-xs leading-relaxed text-[#A3A3A3]">
          Connect your phone to the same Wi-Fi network as the host computer and scan this QR code (or open the URL below) to monitor sensors and control the SmartRoom door from mobile.
        </p>
        <div className="pt-1 font-mono text-xs font-semibold text-[#FACC15]">{mobileUrl}</div>
      </div>

      {qrDataUrl && (
        <div className="rounded-[12px] border border-[#FACC15]/50 bg-[#FACC15] p-2">
          <img
            src={qrDataUrl}
            alt={`QR code for ${mobileUrl}`}
            className="h-36 w-36 rounded-[6px]"
          />
        </div>
      )}
    </div>
  );
};
