import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // tesseract.js spawns a worker script from its own package path, so it must not be bundled.
  serverExternalPackages: ["tesseract.js", "tesseract.js-core", "playwright-core"],
  outputFileTracingIncludes: {
    "/api/documents/extract": ["./node_modules/tesseract.js/**/*", "./node_modules/tesseract.js-core/**/*"],
    "/api/escrow/upload": ["./node_modules/tesseract.js/**/*", "./node_modules/tesseract.js-core/**/*"],
  },
};
export default nextConfig;
