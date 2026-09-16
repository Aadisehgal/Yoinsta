/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "lh3.googleusercontent.com" }, // Google avatars
      { protocol: "https", hostname: "yt3.googleusercontent.com" }, // YouTube channel thumbnails
      { protocol: "https", hostname: "i.ytimg.com" }, // YouTube video thumbnails
      { protocol: "https", hostname: "scontent.cdninstagram.com" }, // Instagram media (Phase 3)
    ],
  },
};

export default nextConfig;
