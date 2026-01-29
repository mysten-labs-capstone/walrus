import React from "react";
import { Link } from "react-router-dom";

export const Landing: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900">
      <div className="container mx-auto px-6 py-20">
        <div className="text-center max-w-4xl mx-auto">
          <h1 className="text-6xl font-bold text-white mb-6">
            Decentralized Storage on Walrus
          </h1>
          <p className="text-xl text-gray-300 mb-12">
            Store your files securely on the Walrus decentralized storage
            network. Fast, reliable, and censorship-resistant.
          </p>
          <div className="flex gap-4 justify-center">
            <Link
              to="/join"
              className="bg-white text-purple-900 hover:bg-gray-100 px-8 py-4 rounded-lg font-bold text-lg transition-colors"
            >
              Get Started
            </Link>
            <Link
              to="/login"
              className="bg-purple-700 text-white hover:bg-purple-800 px-8 py-4 rounded-lg font-bold text-lg transition-colors"
            >
              Login
            </Link>
          </div>
        </div>
        <div className="grid md:grid-cols-3 gap-8 mt-20 max-w-5xl mx-auto">
          <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 text-white">
            <div className="text-4xl mb-4">🔒</div>
            <h3 className="text-xl font-bold mb-2">Secure</h3>
            <p className="text-gray-300">
              End-to-end encryption with OWASP-compliant authentication
            </p>
          </div>
          <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 text-white">
            <div className="text-4xl mb-4">⚡</div>
            <h3 className="text-xl font-bold mb-2">Fast</h3>
            <p className="text-gray-300">
              Distributed storage nodes ensure quick uploads and downloads
            </p>
          </div>
          <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 text-white">
            <div className="text-4xl mb-4">🌐</div>
            <h3 className="text-xl font-bold mb-2">Decentralized</h3>
            <p className="text-gray-300">
              No single point of failure - your data is always available
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
