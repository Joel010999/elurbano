import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#e53935",
};

export const metadata: Metadata = {
  title: "El Urbano - Flota y Monitoreo GPS",
  description: "Monitoreo en tiempo real de colectivos de San Salvador de Jujuy",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "El Urbano",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
