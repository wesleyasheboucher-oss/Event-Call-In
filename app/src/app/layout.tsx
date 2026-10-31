import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Call-In",
  description: "Event call lists, registrations, and attendance",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        {/* Apply the remembered sidebar state before first paint (no layout jump). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem("callin.sidebar")==="collapsed")document.documentElement.dataset.sidebar="collapsed"}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-full">
        {children}
        <Toaster
          position="bottom-center"
          mobileOffset={{ bottom: "calc(var(--bottom-nav) + 12px)" }}
          toastOptions={{
            classNames: {
              toast: "!rounded-xl !border-border !shadow-[var(--shadow-lift)] !font-sans",
            },
          }}
        />
      </body>
    </html>
  );
}
