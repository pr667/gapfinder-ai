import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'GapFinder AI',
  description: 'Finds what you do not know yet, from your own syllabus, notes and past papers, and plans your revision around it.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
