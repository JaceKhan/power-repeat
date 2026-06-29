import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Power Repeat",
  description: "리딩 숙제 녹음 제출 프로그램"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
