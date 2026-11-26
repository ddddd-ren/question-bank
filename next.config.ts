import type { NextConfig } from "next";

const pdfAssets = [
  "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
  "./node_modules/pdfjs-dist/cmaps/*",
  "./node_modules/pdfjs-dist/standard_fonts/*",
  "./node_modules/pdfjs-dist/LICENSE",
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  experimental: {
    // 教材允许 64 MiB，代理还需容纳 multipart 表单字段。
    proxyClientMaxBodySize: "65mb",
    optimizePackageImports: [
      "lucide-react",
      "@radix-ui/react-dialog",
      "@radix-ui/react-select",
      "@radix-ui/react-tabs",
      "@radix-ui/react-progress",
      "zustand",
    ],
  },
  serverExternalPackages: ["better-sqlite3", "pdfjs-dist"],
  outputFileTracingIncludes: {
    "/api/textbooks/import": pdfAssets,
    "/api/questions/preview": pdfAssets,
  },
  outputFileTracingExcludes: {
    "/*": ["./data/**/*", "./server*.log", "./.env*"]
  },
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-cache, no-store, must-revalidate" },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
