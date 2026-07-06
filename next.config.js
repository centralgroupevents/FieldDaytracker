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
  // NOTE: the "*" wildcard only matches a single subdomain label, so the
  // regional cluster (e.g. *.janeway.replit.dev) must be listed explicitly.
  // This only affects the in-editor dev preview; the published app is
  // same-origin and unaffected.
  allowedDevOrigins: [
    "*.replit.dev",
    "*.janeway.replit.dev",
    "*.kirk.replit.dev",
    "*.riker.replit.dev",
    "*.picard.replit.dev",
    "*.worf.replit.dev",
    "*.repl.co",
    "*.replit.app",
    "3d7de859-bc94-4da5-a402-a15f15333d4e-00-1fol5uykybw1g.janeway.replit.dev",
  ],
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
