import type { ReactNode } from "react";

export const metadata = {
  // Shell title for every workspace, not one venture's — a hockey title on
  // the tab leaks across a football academy's screens.
  title: "Athlytica",
  description:
    "Unified registration and athlete telemetry for Athlytica workspaces.",
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
