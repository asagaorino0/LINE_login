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
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://static.line-scdn.net https://translate.googleapis.com https://www.gstatic.com",
              "script-src-elem 'self' 'unsafe-inline' https://static.line-scdn.net https://translate.googleapis.com https://www.gstatic.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://www.gstatic.com",
              "style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com https://www.gstatic.com",
              "font-src 'self' https://fonts.gstatic.com data:",
              "img-src 'self' data: https:",
              "connect-src 'self' https://api.line.me https://static.line-scdn.net https:",
              "frame-src 'self' https://liff.line.me https://access.line.me https://static.line-scdn.net",
            ].join("; "),
          },
        ],
      },
    ];
  },
};
