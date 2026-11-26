/** @type {import('next').NextConfig} */
const apiUrl = process.env.API_URL ?? "http://localhost:8080";

const nextConfig = {
  // Small self-contained build for the Docker image
  output: process.env.DOCKER_BUILD ? "standalone" : undefined,
  // Browsers only ever talk to this site. /api/* is forwarded to the Render backend,
  // so the device cookie stays first-party.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiUrl}/:path*` }];
  },
};

export default nextConfig;
