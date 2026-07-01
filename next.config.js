/** @type {import('next').NextConfig} */
const supabaseHost = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co")
      .hostname;
  } catch {
    return "placeholder.supabase.co";
  }
})();

const nextConfig = {
  // Allow Replit's proxy domains to reach the dev server (Next 15 blocks
  // cross-origin dev requests otherwise). Harmless outside Replit.
  allowedDevOrigins: ["*.replit.dev", "*.repl.co", "*.replit.app"],
  // Skip the type-check/lint phase during `next build`. It was OOM-ing the
  // Replit deploy worker, and we validate types separately.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: supabaseHost,
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

module.exports = nextConfig;
