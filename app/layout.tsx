import "./globals.css";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "NSCC Gift Exchange", description: "Join the NSCC festive gift exchange." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
