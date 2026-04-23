import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Allow Shopify admin to embed this app in an iframe
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors https://*.myshopify.com https://admin.shopify.com https://*.shopify.com;",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
