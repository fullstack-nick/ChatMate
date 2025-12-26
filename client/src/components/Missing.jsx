import React from "react";
import { Link } from "react-router-dom";

export default function Missing() {
  return (
    <div className="h-screen flex items-center justify-center">
      <div className="bg-[#F5F5F5] rounded-2xl shadow-lg max-w-sm w-full h-96 flex flex-col items-center justify-center text-center px-6">
        <div className="card-emoji text-9xl">⚠️</div>
        <h1 className="card-title text-3xl font-bold text-gray-700">Page Not Found</h1>
        <p className="card-text text-gray-600 text-lg">
          Oops! It looks like this page doesn’t exist.
        </p>
        <Link
          to="/main"
          className="card-link inline-block px-6 py-3 text-blue-600 hover:text-blue-800 hover:underline font-medium transition text-lg"
        >
          Go to Main Page
        </Link>
      </div>
    </div>
  );
}