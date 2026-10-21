'use client';

// Caméra + lecture des codes en continu.
// - Android / Chrome : détecteur natif du téléphone (très rapide)
// - iPhone / autres : bibliothèque ZXing
// `onCode(texte)` est appelé à chaque code lu ; c'est au parent de filtrer les doublons.

import { useEffect, useRef, useState } from 'react';

const NATIVE_FORMATS = ['data_matrix', 'ean_13', 'code_128'];

async function getNativeDetector() {
  try {
    if (!('BarcodeDetector' in window)) return null;
    const supported = await window.BarcodeDetector.getSupportedFormats();
    if (!supported.includes('data_matrix')) return null;
    return new window.BarcodeDetector({ formats: NATIVE_FORMATS.filter((f) => supported.includes(f)) });
  } catch {
    return null;
  }
}

export default function Scanner({ onCode, paused = false, compact = false }) {
  const videoRef = useRef(null);
  const onCodeRef = useRef(onCode);
  const pausedRef = useRef(paused);
  const [error, setError] = useState(null);
  const [torch, setTorch] = useState({ available: false, on: false });
  const trackRef = useRef(null);

  onCodeRef.current = onCode;
  pausedRef.current = paused;

  useEffect(() => {
    let stopped = false;
    let stream = null;
    let zxingControls = null;
    let timer = null;

    async function start() {
      if (!window.isSecureContext) {
        setError("La caméra ne fonctionne qu'en https (ou sur localhost). Voir le README.");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        });
      } catch (e) {
        setError(
          e?.name === 'NotAllowedError'
            ? "Accès à la caméra refusé. Autorise-le dans les réglages du navigateur."
            : "Impossible d'ouvrir la caméra sur cet appareil."
        );
        return;
      }
      if (stopped) return stream.getTracks().forEach((t) => t.stop());

      const track = stream.getVideoTracks()[0];
      trackRef.current = track;
      try {
        const caps = track.getCapabilities?.() || {};
        if (caps.focusMode?.includes('continuous')) {
          await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
        }
        if (caps.torch) setTorch({ available: true, on: false });
      } catch {
        /* réglages facultatifs */
      }

      const video = videoRef.current;
      video.srcObject = stream;
      video.setAttribute('playsinline', 'true');
      await video.play().catch(() => {});

      const native = await getNativeDetector();
      if (native) {
        const loop = async () => {
          if (stopped) return;
          if (!pausedRef.current && video.readyState >= 2) {
            try {
              const codes = await native.detect(video);
              codes.forEach((c) => c.rawValue && onCodeRef.current?.(c.rawValue));
            } catch {
              /* image suivante */
            }
          }
          timer = setTimeout(loop, 120);
        };
        loop();
      } else {
        const [{ BrowserMultiFormatReader }, { DecodeHintType, BarcodeFormat }] = await Promise.all([
          import('@zxing/browser'),
          import('@zxing/library'),
        ]);
        if (stopped) return;
        const hints = new Map([
          [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.DATA_MATRIX, BarcodeFormat.EAN_13, BarcodeFormat.CODE_128]],
          [DecodeHintType.TRY_HARDER, true],
        ]);
        const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 100 });
        zxingControls = await reader.decodeFromStream(stream, video, (result) => {
          if (result && !pausedRef.current) onCodeRef.current?.(result.getText());
        });
      }
    }

    start();
    return () => {
      stopped = true;
      clearTimeout(timer);
      try {
        zxingControls?.stop();
      } catch {}
      stream?.getTracks().forEach((t) => t.stop());
      trackRef.current = null;
    };
  }, []);

  async function toggleTorch() {
    const on = !torch.on;
    try {
      await trackRef.current?.applyConstraints({ advanced: [{ torch: on }] });
      setTorch({ available: true, on });
    } catch {
      setTorch({ available: false, on: false });
    }
  }

  if (error) {
    return <div className={`scanner scanner--error ${compact ? 'scanner--compact' : ''}`}>{error}</div>;
  }

  return (
    <div className={`scanner ${compact ? 'scanner--compact' : ''} ${paused ? 'scanner--paused' : ''}`}>
      <video ref={videoRef} muted playsInline />
      <div className="scanner__frame" aria-hidden="true" />
      <p className="scanner__hint">Vise le petit carré noir et blanc sur la boîte</p>
      {torch.available && (
        <button type="button" className="scanner__torch" onClick={toggleTorch} aria-label="Lampe">
          {torch.on ? '🔦 Éteindre' : '🔦 Lampe'}
        </button>
      )}
    </div>
  );
}
