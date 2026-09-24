import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "null",
    "127.0.0.1",
    "0.0.0.0",
    "localhost",
    "vscode-webview.net",
    "*.vscode-cdn.net",
    "*.cursor.com",
    "**.cursor.com",
    "*.cursor.sh",
    "**.cursor.sh",
    "*.cursorusercontent.com",
  ],
};

export default nextConfig;
