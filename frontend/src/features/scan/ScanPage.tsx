import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Alert,
  Paper,
  Divider,
} from "@mui/material";
import PhotoCameraOutlinedIcon from "@mui/icons-material/PhotoCameraOutlined";
import QrCodeScannerIcon from "@mui/icons-material/QrCodeScanner";
import KeyboardAltOutlinedIcon from "@mui/icons-material/KeyboardAltOutlined";
import { Html5Qrcode } from "html5-qrcode";
import { PageHeader } from "../../components/shared/PageHeader";
import { api, ApiException } from "../../api/client";

export const ScanPage: React.FC = () => {
  const navigate = useNavigate();
  const [typedCode, setTypedCode] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const isSecure = window.isSecureContext;
  const qrScannerRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);

  const handleResolveCode = async (code: string) => {
    if (!code.trim()) return;
    setIsResolving(true);
    setErrorMsg(null);
    try {
      const res = await api.resolveCode(code.trim());
      if (res.type === "item") {
        navigate(`/items?selected=${res.id}`);
      } else if (res.type === "location") {
        navigate(`/locations`);
      }
    } catch (err: any) {
      if (err instanceof ApiException) {
        setErrorMsg(err.error.message);
      } else {
        setErrorMsg(`Could not resolve code "${code}"`);
      }
    } finally {
      setIsResolving(false);
    }
  };

  const handleTypedSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleResolveCode(typedCode);
  };

  const handleFileScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsResolving(true);
      setErrorMsg(null);
      const scanner = new Html5Qrcode("reader-hidden");
      const result = await scanner.scanFile(file, true);
      handleResolveCode(result);
    } catch {
      setErrorMsg("No readable QR code or barcode found in this image. Try another photo or enter the code manually.");
    } finally {
      setIsResolving(false);
      if (e.target) e.target.value = "";
    }
  };

  const startCamera = async () => {
    setCameraError(null);
    try {
      const html5QrCode = new Html5Qrcode("reader-video");
      qrScannerRef.current = html5QrCode;
      setCameraActive(true);

      await html5QrCode.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          html5QrCode.stop().catch(console.error);
          setCameraActive(false);
          handleResolveCode(decodedText);
        },
        () => {}
      );
    } catch (err: any) {
      console.error(err);
      setCameraError(
        "Could not start live camera. Browsers require HTTPS on mobile devices. Use 'Take a Photo' below or enter the code manually."
      );
      setCameraActive(false);
    }
  };

  const stopCamera = async () => {
    if (qrScannerRef.current && cameraActive) {
      try {
        await qrScannerRef.current.stop();
      } catch (err) {
        console.error(err);
      }
      setCameraActive(false);
    }
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  return (
    <Box sx={{ maxWidth: 640, mx: "auto" }}>
      <PageHeader
        title="Scan QR or Barcode"
        subtitle="Quickly locate items and storage shelves by scanning labels"
      />

      {errorMsg && (
        <Alert severity="error" onClose={() => setErrorMsg(null)} sx={{ mb: 3 }}>
          {errorMsg}
        </Alert>
      )}

      {/* Hidden div for file decoding */}
      <div id="reader-hidden" style={{ display: "none" }} />

      {/* Mode 1: Live Camera Scanner */}
      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ textAlign: "center" }}>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 1, mb: 1.5 }}>
            <QrCodeScannerIcon color="primary" />
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Live Camera Scanner
            </Typography>
          </Box>

          {!isSecure && (
            <Alert severity="info" sx={{ mb: 2, textAlign: "left" }}>
              Mobile browsers require HTTPS (or localhost) to grant live camera access. If you are accessing this over LAN HTTP (e.g. <code>http://192.168.x.x</code>), use &quot;Take a Photo&quot; or enter the code below.
            </Alert>
          )}

          {cameraError && (
            <Alert severity="warning" sx={{ mb: 2, textAlign: "left" }}>
              {cameraError}
            </Alert>
          )}

          <Box
            id="reader-video"
            sx={{
              width: "100%",
              minHeight: cameraActive ? 280 : 0,
              bgcolor: cameraActive ? "#000" : "transparent",
              borderRadius: 2,
              overflow: "hidden",
              mb: cameraActive ? 2 : 0,
            }}
          />

          {!cameraActive ? (
            <Button
              variant="contained"
              size="large"
              startIcon={<QrCodeScannerIcon />}
              onClick={startCamera}
              disabled={isResolving}
              sx={{ px: 4 }}
            >
              Start Live Camera
            </Button>
          ) : (
            <Button variant="outlined" color="secondary" onClick={stopCamera}>
              Stop Camera
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Mode 2: Photo Capture Fallback */}
      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ textAlign: "center" }}>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 1, mb: 1 }}>
            <PhotoCameraOutlinedIcon color="primary" />
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              Scan from Photo
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Snap a picture of the QR code or barcode using your phone camera:
          </Typography>

          <input
            type="file"
            accept="image/*"
            capture="environment"
            ref={fileInputRef}
            style={{ display: "none" }}
            onChange={handleFileScan}
          />

          <Button
            variant="outlined"
            size="large"
            startIcon={<PhotoCameraOutlinedIcon />}
            onClick={() => fileInputRef.current?.click()}
            disabled={isResolving}
          >
            Take Photo of Code
          </Button>
        </CardContent>
      </Card>

      {/* Mode 3: Hardware Scanner / Manual Input */}
      <Card>
        <CardContent>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
            <KeyboardAltOutlinedIcon color="primary" />
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              Barcode Scanner / Manual Code
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            USB or Bluetooth barcode scanners type directly here. You can also manually type an item ID (<code>I12</code>) or location ID (<code>L3</code>).
          </Typography>

          <form onSubmit={handleTypedSubmit}>
            <Box sx={{ display: "flex", gap: 1.5 }}>
              <TextField
                inputRef={textInputRef}
                fullWidth
                size="medium"
                placeholder="e.g. I123, L45, or barcode number"
                value={typedCode}
                onChange={(e) => setTypedCode(e.target.value)}
                disabled={isResolving}
                autoFocus
              />
              <Button
                type="submit"
                variant="contained"
                disabled={!typedCode.trim() || isResolving}
                sx={{ px: 3 }}
              >
                Go
              </Button>
            </Box>
          </form>
        </CardContent>
      </Card>
    </Box>
  );
};
