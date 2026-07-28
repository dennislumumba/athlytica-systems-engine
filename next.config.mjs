/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      // The plural is what people type and what older links use. A
      // redirect rather than a rewrite, so the canonical path lands in
      // the address bar — and so the ?redirectTo= the auth guard
      // captures is the real route rather than the alias.
      { source: "/dashboards", destination: "/dashboard", permanent: false },
      { source: "/dashboards/:path*", destination: "/dashboard/:path*", permanent: false },
      // Plausible hand-typed venture paths → the canonical slug alias.
      { source: "/dashboard/leagues/big-ice", destination: "/dashboard/w/big-ice", permanent: false },
      { source: "/dashboard/academies/big-ice", destination: "/dashboard/w/big-ice", permanent: false },
    ];
  },
};

export default nextConfig;
