import type { ReactNode } from "react";

export const metadata = {
  title: "Nairobi Roller Hockey League",
  description:
    "Unified registration for NRHL, Big Ice Academy, and Athlytica programs.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          background: "#0b1220",
          color: "#e6edf6",
          minHeight: "100vh",
        }}
      >
        {children}
      </body>
    </html>
  );
}
