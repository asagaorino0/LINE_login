// next.config.mjs
export default {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://www.gstatic.com",
              "style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com https://www.gstatic.com",
              "font-src 'self' https://fonts.gstatic.com data:",
              "img-src 'self' data: https:",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://translate.googleapis.com https://www.gstatic.com",
              "connect-src 'self' https:",
              "frame-src 'self' https://translate.google.com",
            ].join("; "),
          },
        ],
      },
    ];
  },
};
