import { JetBrains_Mono } from 'next/font/google';

// JetBrains Mono (Matt's brief, 28 Oct 2026): the Under the hood slide's
// tracker and figure label, and its diagram's layer labels. 400 and 500 only.
export const jetbrains = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-jetbrains' });
