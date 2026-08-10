/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    dirs: ["src", "scripts", "tests"],
  },
};

export default nextConfig;
