import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "제이스칸 POWER REPEAT",
  description: "반복을 통해 최고의 실력을 만드는 리딩녹음 숙제 제출프로그램"
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
