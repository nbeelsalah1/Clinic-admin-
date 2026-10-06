import {MfaGate} from "./mfa-panel";
import PwaRegistration from "./pwa-registration";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://clinic-ops-palestine.nbeelsalah4.chatgpt.site"),
  title: { default: "عيادتي | نظام إدارة العيادات في فلسطين", template: "%s | عيادتي" },
  manifest:"/manifest.webmanifest",
  description: "نظام إدارة عيادات ومراكز طبية في فلسطين: ملفات المرضى، المواعيد، السجلات الطبية، المحاسبة والتخصصات من مكان واحد.",
  keywords: ["إدارة العيادات في فلسطين", "برنامج عيادات", "نظام إدارة المواعيد الطبية", "السجل الطبي الإلكتروني", "عيادتي"],
  alternates: { canonical: "/" },
  openGraph: { type: "website", locale: "ar_PS", siteName: "عيادتي", title: "عيادتي | نظام إدارة العيادات في فلسطين", description: "نظّم المواعيد والسجلات الطبية والفوترة والتخصصات في منصة واحدة للعيادات الفلسطينية." },
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl">
      <body className="antialiased"><PwaRegistration/><MfaGate>{children}</MfaGate></body>
    </html>
  );
}
