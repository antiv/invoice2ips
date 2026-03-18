/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { QRCodeSVG } from 'qrcode.react';
import { Camera, Upload, RefreshCw, CheckCircle2, AlertCircle, QrCode, ArrowLeft, Loader2, Copy, Share2, X, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toPng } from 'html-to-image';

// --- Types ---

type Language = 'sr' | 'en';

const translations = {
  sr: {
    title: "IPS Skener",
    standard: "NBS Standard",
    scanTitle: "Skenirajte račun",
    scanDesc: "Fotografišite račun da biste automatski generisali IPS QR kod za vašu bankarsku aplikaciju.",
    openCamera: "Otvori kameru",
    uploadGallery: "Otpremi iz galerije",
    or: "Ili",
    analyzing: "Analiziranje računa",
    extracting: "Izvlačenje podataka pomoću AI...",
    extracted: "Podaci su izvučeni",
    amount: "Iznos (RSD)",
    recipient: "Primalac",
    account: "Račun",
    purpose: "Svrha",
    reference: "Poziv na broj",
    scanInstruction: "Skenirajte ovaj kod svojom mobilnom bankarskom aplikacijom za trenutno plaćanje.",
    openBank: "Otvori aplikaciju banke",
    scanAnother: "Skeniraj sledeći",
    errorTitle: "Nešto nije u redu",
    tryAgain: "Pokušaj ponovo",
    cameraError: "Nije moguće pristupiti kameri. Proverite dozvole.",
    processingError: "Nije uspelo izvlačenje podataka. Pokušajte ponovo sa jasnijom slikom.",
    na: "N/A",
    copied: "Kopirano u privremenu memoriju",
    copyHint: "Ako se aplikacija banke nije otvorila, kopirali smo IPS string. Možete ga nalepiti u aplikaciji banke.",
    shareTitle: "Podeli QR kod",
    shareDesc: "Podelite IPS QR kod kao sliku.",
    selectBank: "Izaberite banku",
    genericIps: "Generički IPS (Preporučeno)",
    bankIntesa: "Banca Intesa",
    bankRaiffeisen: "Raiffeisen Banka",
    bankYettel: "Yettel Bank",
    bankOTP: "OTP Banka",
    bankNLB: "NLB Komercijalna"
  },
  en: {
    title: "IPS Scanner",
    standard: "NBS Standard",
    scanTitle: "Scan Your Invoice",
    scanDesc: "Take a photo of your invoice to automatically generate an IPS QR code for your banking app.",
    openCamera: "Open Camera",
    uploadGallery: "Upload from Gallery",
    or: "Or",
    analyzing: "Analyzing Invoice",
    extracting: "Extracting payment details using AI...",
    extracted: "Invoice Details Extracted",
    amount: "Amount (RSD)",
    recipient: "Recipient",
    account: "Account",
    purpose: "Purpose",
    reference: "Reference",
    scanInstruction: "Scan this code with your mobile banking app to pay instantly.",
    openBank: "Open Bank App",
    scanAnother: "Scan Another",
    errorTitle: "Something went wrong",
    tryAgain: "Try Again",
    cameraError: "Could not access camera. Please check permissions.",
    processingError: "Failed to extract data from the invoice. Please try again with a clearer picture.",
    na: "N/A",
    copied: "Copied to clipboard",
    copyHint: "If the bank app didn't open, we've copied the IPS string. You can paste it in your bank app.",
    shareTitle: "Share QR Code",
    shareDesc: "Share the IPS QR code as an image.",
    selectBank: "Select Your Bank",
    genericIps: "Generic IPS (Recommended)",
    bankIntesa: "Banca Intesa",
    bankRaiffeisen: "Raiffeisen Banka",
    bankYettel: "Yettel Bank",
    bankOTP: "OTP Banka",
    bankNLB: "NLB Komercijalna"
  }
};

interface InvoiceData {
  recipientName: string;
  accountNumber: string;
  amount: number;
  paymentCode: string;
  purpose: string;
  referenceNumber: string;
}

type AppState = 'idle' | 'capturing' | 'processing' | 'result' | 'error';

// --- Constants ---

const GEMINI_MODEL = "gemini-3-flash-preview";

// --- Components ---

export default function App() {
  const [lang, setLang] = useState<Language>('sr');
  const [state, setState] = useState<AppState>('idle');
  const t = translations[lang];
  const [image, setImage] = useState<string | null>(null);
  const [invoiceData, setInvoiceData] = useState<InvoiceData | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showBankModal, setShowBankModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showCopyHint, setShowCopyHint] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const qrRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Helpers ---

  const startCamera = async () => {
    try {
      setState('capturing');
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
      setError(t.cameraError);
      setState('error');
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
    }
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg');
        setImage(dataUrl);
        stopCamera();
        processInvoice(dataUrl);
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        setImage(dataUrl);
        processInvoice(dataUrl);
      };
      reader.readAsDataURL(file);
    }
  };

  const processInvoice = async (base64Image: string) => {
    setState('processing');
    setError(null);

    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error("Gemini API key is missing.");

      const genAI = new GoogleGenAI({ apiKey });
      
      const prompt = `Extract invoice details for a Serbian NBS IPS payment. 
      Look for:
      - Recipient Name (Primalac)
      - Account Number (Račun primaoca, 18 digits)
      - Amount (Iznos, in RSD)
      - Payment Code (Šifra plaćanja, usually 3 digits like 289, 189)
      - Purpose of Payment (Svrha uplate)
      - Reference Number (Poziv na broj, include model if present like 97 or 11)`;

      const response = await genAI.models.generateContent({
        model: GEMINI_MODEL,
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType: "image/jpeg",
                  data: base64Image.split(',')[1]
                }
              }
            ]
          }
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              recipientName: { type: Type.STRING },
              accountNumber: { type: Type.STRING, description: "18 digit account number without dashes" },
              amount: { type: Type.NUMBER },
              paymentCode: { type: Type.STRING },
              purpose: { type: Type.STRING },
              referenceNumber: { type: Type.STRING }
            },
            required: ["recipientName", "accountNumber", "amount"]
          }
        }
      });

      const data = JSON.parse(response.text || '{}') as InvoiceData;
      
      // Clean account number (remove dashes, spaces)
      if (data.accountNumber) {
        data.accountNumber = data.accountNumber.replace(/[^0-9]/g, '');
      }
      
      setInvoiceData(data);
      setState('result');
    } catch (err) {
      console.error("Processing error:", err);
      setError(t.processingError);
      setState('error');
    }
  };

  const generateIpsString = (data: InvoiceData) => {
    // NBS IPS Format: K:PR|V:01|C:1|R:[Account]|N:[Recipient]|I:RSD[Amount]|SF:[Code]|S:[Purpose]|RO:[Reference]
    // Amount format: RSD1234,56 (comma as decimal)
    const formattedAmount = `RSD${(data.amount || 0).toFixed(2).replace('.', ',')}`;
    const cleanAccount = (data.accountNumber || '').replace(/[^0-9]/g, '');
    
    const parts = [
      `K:PR`,
      `V:01`,
      `C:1`,
      `R:${cleanAccount}`,
      `N:${data.recipientName || ''}`,
      `I:${formattedAmount}`,
      `SF:${data.paymentCode || '289'}`,
      `S:${data.purpose || 'Uplata po računu'}`,
      `RO:${data.referenceNumber || ''}`
    ];

    return parts.join('|');
  };

  const copyToClipboard = (text: string) => {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(err => {
      console.error("Clipboard error:", err);
    });
  };

  const shareQrCode = async () => {
    if (qrRef.current) {
      try {
        const dataUrl = await toPng(qrRef.current, { backgroundColor: '#fff' });
        const blob = await (await fetch(dataUrl)).blob();
        const file = new File([blob], 'ips-qr.png', { type: 'image/png' });

        if (navigator.share) {
          await navigator.share({
            title: t.title,
            text: t.shareDesc,
            files: [file],
          });
        } else {
          // Fallback: download
          const link = document.createElement('a');
          link.download = 'ips-qr.png';
          link.href = dataUrl;
          link.click();
        }
      } catch (err) {
        console.error("Sharing error:", err);
      }
    }
  };

  const openBankApp = (scheme: string) => {
    if (!invoiceData) return;
    const ipsString = generateIpsString(invoiceData);
    
    // 1. Copy IMMEDIATELY to preserve user activation
    copyToClipboard(ipsString);
    
    // 2. Then attempt to open the app
    const url = `${scheme}${encodeURIComponent(ipsString)}`;
    window.location.href = url;
    
    setShowCopyHint(true);
    setTimeout(() => setShowCopyHint(false), 5000);
    setShowBankModal(false);
  };

  const banks = [
    { name: t.genericIps, scheme: 'ips://' },
    { name: t.bankIntesa, scheme: 'mobi://' },
    { name: t.bankRaiffeisen, scheme: 'raiffeisen://' },
    { name: t.bankYettel, scheme: 'mobibanka://' },
    { name: t.bankOTP, scheme: 'otpbanka://' },
    { name: t.bankNLB, scheme: 'nlb://' },
    { name: "AIK Banka", scheme: 'aikbanka://' },
    { name: "Eurobank Direktna", scheme: 'eurobank://' },
    { name: "Halkbank", scheme: 'halkbank://' },
    { name: "Adriatic Bank", scheme: 'adriatic://' },
  ];

  const reset = () => {
    setImage(null);
    setInvoiceData(null);
    setError(null);
    setState('idle');
  };

  // --- Render ---

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 font-sans selection:bg-emerald-100">
      <div className="max-w-md mx-auto min-h-screen flex flex-col shadow-2xl bg-white relative overflow-hidden">
        
        {/* Header */}
        <header className="p-6 flex items-center justify-between border-b border-stone-100 bg-white/80 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-emerald-200">
              <QrCode size={24} />
            </div>
            <div>
              <h1 className="font-bold text-lg leading-tight">{t.title}</h1>
              <p className="text-xs text-stone-400 font-medium uppercase tracking-wider">{t.standard}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setLang(lang === 'sr' ? 'en' : 'sr')}
              className="px-2 py-1 text-[10px] font-bold border border-stone-200 rounded-md hover:bg-stone-50 transition-colors uppercase"
            >
              {lang === 'sr' ? 'EN' : 'SR'}
            </button>
            {state !== 'idle' && (
              <button 
                onClick={reset}
                className="p-2 hover:bg-stone-100 rounded-full transition-colors text-stone-400 hover:text-stone-600"
              >
                <RefreshCw size={20} />
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 flex flex-col p-6 overflow-y-auto">
          <AnimatePresence mode="wait">
            
            {/* Idle State */}
            {state === 'idle' && (
              <motion.div 
                key="idle"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="flex-1 flex flex-col justify-center gap-8"
              >
                <div className="text-center space-y-4">
                  <div className="w-24 h-24 bg-emerald-50 rounded-3xl flex items-center justify-center mx-auto text-emerald-600 mb-6">
                    <Camera size={48} strokeWidth={1.5} />
                  </div>
                  <h2 className="text-2xl font-bold text-stone-800">{t.scanTitle}</h2>
                  <p className="text-stone-500 max-w-[280px] mx-auto">
                    {t.scanDesc}
                  </p>
                </div>

                <div className="space-y-3">
                  <button 
                    onClick={startCamera}
                    className="w-full py-4 bg-stone-900 text-white rounded-2xl font-semibold flex items-center justify-center gap-3 shadow-xl shadow-stone-200 active:scale-[0.98] transition-all"
                  >
                    <Camera size={20} />
                    {t.openCamera}
                  </button>
                  
                  <div className="relative py-4">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-stone-100"></div>
                    </div>
                    <div className="relative flex justify-center text-xs uppercase tracking-widest text-stone-400 font-bold bg-white px-4">
                      {t.or}
                    </div>
                  </div>

                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-4 bg-white border-2 border-stone-100 text-stone-600 rounded-2xl font-semibold flex items-center justify-center gap-3 hover:bg-stone-50 active:scale-[0.98] transition-all"
                  >
                    <Upload size={20} />
                    {t.uploadGallery}
                  </button>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileUpload} 
                    accept="image/*" 
                    className="hidden" 
                  />
                </div>
              </motion.div>
            )}

            {/* Camera State */}
            {state === 'capturing' && (
              <motion.div 
                key="capturing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 flex flex-col relative rounded-3xl overflow-hidden bg-black"
              >
                <video 
                  ref={videoRef} 
                  autoPlay 
                  playsInline 
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 border-[24px] border-black/20 pointer-events-none">
                  <div className="w-full h-full border-2 border-white/50 rounded-xl border-dashed"></div>
                </div>
                
                <div className="absolute bottom-8 left-0 right-0 flex justify-center items-center gap-8">
                  <button 
                    onClick={reset}
                    className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white"
                  >
                    <ArrowLeft size={24} />
                  </button>
                  <button 
                    onClick={capturePhoto}
                    className="w-20 h-20 rounded-full bg-white p-1 shadow-2xl"
                  >
                    <div className="w-full h-full rounded-full border-4 border-stone-900 flex items-center justify-center">
                      <div className="w-12 h-12 rounded-full bg-stone-900"></div>
                    </div>
                  </button>
                  <div className="w-12 h-12"></div>
                </div>
              </motion.div>
            )}

            {/* Processing State */}
            {state === 'processing' && (
              <motion.div 
                key="processing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 flex flex-col items-center justify-center text-center space-y-8"
              >
                <div className="relative">
                  <div className="w-32 h-32 rounded-full border-4 border-emerald-100 border-t-emerald-600 animate-spin"></div>
                  <div className="absolute inset-0 flex items-center justify-center text-emerald-600">
                    <Loader2 size={40} className="animate-pulse" />
                  </div>
                </div>
                <div className="space-y-2">
                  <h2 className="text-xl font-bold">{t.analyzing}</h2>
                  <p className="text-stone-500">{t.extracting}</p>
                </div>
                {image && (
                  <div className="w-48 h-48 rounded-2xl overflow-hidden shadow-lg border-4 border-white rotate-3">
                    <img src={image} alt="Preview" className="w-full h-full object-cover grayscale opacity-50" />
                  </div>
                )}
              </motion.div>
            )}

            {/* Result State */}
            {state === 'result' && invoiceData && (
              <motion.div 
                key="result"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex-1 flex flex-col space-y-6"
              >
                <div className="bg-emerald-50 p-4 rounded-2xl flex items-center gap-3 text-emerald-700">
                  <CheckCircle2 size={24} />
                  <span className="font-semibold">{t.extracted}</span>
                </div>

                <div className="bg-white border border-stone-100 rounded-3xl p-6 shadow-sm space-y-6">
                  <div className="flex flex-col items-center gap-4">
                    <div className="p-4 bg-stone-50 rounded-2xl" ref={qrRef}>
                      <QRCodeSVG 
                        value={generateIpsString(invoiceData)} 
                        size={200}
                        level="M"
                        includeMargin={true}
                      />
                    </div>
                    <div className="flex gap-3">
                      <button 
                        onClick={() => copyToClipboard(generateIpsString(invoiceData))}
                        className="flex items-center gap-2 px-4 py-2 bg-stone-50 text-stone-600 rounded-xl hover:bg-stone-100 transition-colors border border-stone-100"
                        title="Copy IPS String"
                      >
                        <Copy size={16} />
                        <span className="text-xs font-bold uppercase tracking-wider">Copy IPS</span>
                      </button>
                      <button 
                        onClick={shareQrCode}
                        className="flex items-center gap-2 px-4 py-2 bg-stone-50 text-stone-600 rounded-xl hover:bg-stone-100 transition-colors border border-stone-100"
                        title="Share QR Code"
                      >
                        <Share2 size={16} />
                        <span className="text-xs font-bold uppercase tracking-wider">Share</span>
                      </button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <EditableRow 
                      label={t.recipient} 
                      value={invoiceData.recipientName} 
                      onChange={(val) => setInvoiceData(prev => prev ? { ...prev, recipientName: val } : null)}
                    />
                    <EditableRow 
                      label={t.account} 
                      value={invoiceData.accountNumber} 
                      isMono 
                      onChange={(val) => setInvoiceData(prev => prev ? { ...prev, accountNumber: val.replace(/[^0-9]/g, '') } : null)}
                    />
                    <div className="flex justify-between items-center gap-4 border-b border-stone-50 pb-2">
                      <span className="text-xs font-bold text-stone-400 uppercase tracking-wider">{t.amount}</span>
                      <div className="flex items-center gap-2 bg-stone-50 px-3 py-1 rounded-xl border border-stone-100 focus-within:border-emerald-500 transition-colors">
                        <input 
                          type="number" 
                          value={invoiceData.amount || ''} 
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            setInvoiceData(prev => prev ? { ...prev, amount: isNaN(val) ? 0 : val } : null);
                          }}
                          className="text-right text-lg font-bold text-stone-900 bg-transparent outline-none w-32"
                          placeholder="0.00"
                          step="0.01"
                        />
                      </div>
                    </div>
                    <EditableRow 
                      label={t.purpose} 
                      value={invoiceData.purpose || ''} 
                      onChange={(val) => setInvoiceData(prev => prev ? { ...prev, purpose: val } : null)}
                    />
                    <EditableRow 
                      label={t.reference} 
                      value={invoiceData.referenceNumber || ''} 
                      isMono 
                      onChange={(val) => setInvoiceData(prev => prev ? { ...prev, referenceNumber: val } : null)}
                    />
                  </div>
                </div>

                <div className="space-y-3 pt-4">
                  <p className="text-center text-xs text-stone-400 font-medium px-4">
                    {t.scanInstruction}
                  </p>
                  <button 
                    onClick={() => setShowBankModal(true)}
                    className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-semibold flex items-center justify-center gap-3 shadow-lg shadow-emerald-100 active:scale-[0.98] transition-all"
                  >
                    <ExternalLink size={20} />
                    {t.openBank}
                  </button>
                  <button 
                    onClick={reset}
                    className="w-full py-4 bg-stone-100 text-stone-600 rounded-2xl font-semibold active:scale-[0.98] transition-all"
                  >
                    {t.scanAnother}
                  </button>
                </div>
              </motion.div>
            )}

            {/* Error State */}
            {state === 'error' && (
              <motion.div 
                key="error"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex-1 flex flex-col items-center justify-center text-center space-y-6"
              >
                <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center text-red-500">
                  <AlertCircle size={40} />
                </div>
                <div className="space-y-2">
                  <h2 className="text-xl font-bold">{t.errorTitle}</h2>
                  <p className="text-stone-500 px-8">{error}</p>
                </div>
                <button 
                  onClick={reset}
                  className="px-8 py-3 bg-stone-900 text-white rounded-xl font-semibold shadow-lg shadow-stone-200"
                >
                  {t.tryAgain}
                </button>
              </motion.div>
            )}

          </AnimatePresence>
        </main>

        {/* Footer Info */}
        <footer className="p-6 text-center border-t border-stone-50">
          <p className="text-[10px] text-stone-300 font-bold uppercase tracking-[0.2em]">
            Powered by Ant Biocode
          </p>
        </footer>

        {/* Bank Selection Modal */}
        <AnimatePresence>
          {showBankModal && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm"
            >
              <motion.div 
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                className="w-full max-w-md bg-white rounded-t-[32px] sm:rounded-[32px] overflow-hidden shadow-2xl"
              >
                <div className="p-6 border-b border-stone-100 flex items-center justify-between">
                  <h3 className="text-xl font-bold">{t.selectBank}</h3>
                  <button 
                    onClick={() => setShowBankModal(false)}
                    className="p-2 hover:bg-stone-100 rounded-full transition-colors"
                  >
                    <X size={24} />
                  </button>
                </div>
                <div className="p-4 max-h-[60vh] overflow-y-auto space-y-2">
                  {banks.map((bank) => (
                    <button 
                      key={bank.name}
                      onClick={() => openBankApp(bank.scheme)}
                      className="w-full p-4 text-left rounded-2xl hover:bg-stone-50 border border-transparent hover:border-stone-100 transition-all flex items-center justify-between group"
                    >
                      <span className="font-semibold text-stone-700">{bank.name}</span>
                      <ExternalLink size={18} className="text-stone-300 group-hover:text-emerald-600 transition-colors" />
                    </button>
                  ))}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Copy Toast */}
        <AnimatePresence>
          {(copied || showCopyHint) && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="fixed bottom-24 left-4 right-4 z-50 bg-stone-900 text-white px-6 py-4 rounded-2xl text-sm font-medium shadow-2xl flex flex-col gap-2"
            >
              <div className="flex items-center gap-2 font-bold">
                <CheckCircle2 size={18} className="text-emerald-400" />
                {t.copied}
              </div>
              {showCopyHint && (
                <p className="text-xs text-stone-400 leading-relaxed">
                  {t.copyHint}
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <canvas ref={canvasRef} className="hidden" />
      </div>
    </div>
  );
}

function EditableRow({ label, value, isMono = false, onChange }: { label: string, value: string, isMono?: boolean, onChange: (val: string) => void }) {
  return (
    <div className="flex flex-col gap-1 border-b border-stone-50 pb-2 last:border-0">
      <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">{label}</span>
      <input 
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full text-sm bg-transparent outline-none text-stone-700 focus:text-emerald-600 transition-colors ${isMono ? 'font-mono' : ''}`}
      />
    </div>
  );
}
