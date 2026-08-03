import React from 'react';
import { Outlet } from 'react-router-dom';
import { Navbar } from './Navbar';

export const Layout: React.FC = () => {
  return (
    <div className="min-h-screen flex flex-col bg-[#0b1622] text-[#a0b1c5]">
      <Navbar />
      <main className="flex-1 w-full max-w-[1450px] mx-auto px-3 sm:px-5 py-5">
        <Outlet />
      </main>
      <footer className="bg-[#0b1622] border-t border-[#1a2a3e] py-6 mt-12 text-center text-xs text-slate-500">
        AniStash Play — Self-Hosted Anime Library & Streaming App
      </footer>
    </div>
  );
};
