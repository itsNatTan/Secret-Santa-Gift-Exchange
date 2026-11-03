import "./globals.css";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "Gift Exchange", description: "Create or join a gift exchange. No account needed." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
