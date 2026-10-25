import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "El Urbano - Inspector",
  description: "Panel de control para inspectores de El Urbano",
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
