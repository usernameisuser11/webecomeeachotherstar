import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "우리가 서로의 별이 될 때 | 또래상담 별자리",
  description: "서로 자주 만나지 못하더라도 각자의 별을 남기고, 그 빛으로 하나의 별자리를 만드는 작은 공간입니다.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  );
}
