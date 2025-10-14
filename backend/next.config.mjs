/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  webpack: (config, { isServer }) => {
    // Handle WASM files
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
      layers: true,
    };

    // Add rule for .wasm files
    config.module.rules.push({
      test: /\.wasm$/,
      type: 'asset/resource',
    });

    // Ensure WASM files are treated properly on server
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push({
        '@mysten/walrus': 'commonjs @mysten/walrus',
      });
    }

    return config;
  },
};

export default nextConfig;