import React from 'react';
import './globals.css';
export const metadata = {
  title: 'CI-CD_Sentinel',
  description: 'Neo4j-powered deployment observability',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
