import React from "react";
import { Link } from "react-router-dom";

export default function Unauthorized() {
  return (
    <div className="h-screen flex items-center justify-center">
      <div className="bg-[#F5F5F5] rounded-2xl shadow-lg max-w-sm w-full h-96 flex flex-col items-center justify-center text-center px-6">
        <div className="card-emoji-cross text-9xl">❌</div>
        <h1 className="card-title text-3xl font-bold text-gray-700">Unauthorized</h1>
        <p className="card-text text-gray-600 text-lg">
          You’re not authorized to view this page!
        </p>
        <Link
          to="/login"
          className="card-link-cross inline-block px-6 py-3 text-blue-600 hover:text-blue-800 hover:underline font-medium transition text-lg"
        >
          Go to Login Page
        </Link>
      </div>
    </div>
  );
}