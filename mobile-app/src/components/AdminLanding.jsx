import React from 'react';
import { Shield, BarChart3, MapPinned, LogIn, ChevronLeft } from 'lucide-react';

export default function AdminLanding({ onEnterAdmin, onBackToUser }) {
  const token = localStorage.getItem('sentra_admin_token');

  return (
    <div className="min-h-screen bg-slate-950 text-white relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.18),transparent_40%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.12),transparent_35%)]" />

      <header className="relative z-10 flex items-center justify-between px-4 py-4 border-b border-white/5 bg-black/20 backdrop-blur">
        <button onClick={onBackToUser} className="flex items-center space-x-2 text-slate-200 hover:text-white transition-colors">
          <ChevronLeft className="h-5 w-5" />
          <span className="font-semibold">Back to User</span>
        </button>
        <div className="flex items-center space-x-2 px-3 py-1 rounded-full bg-white/10 border border-white/10 text-xs font-semibold">
          <span className="h-2 w-2 rounded-full bg-emerald-400 inline-block" />
          <span>ADMIN PORTAL</span>
        </div>
      </header>

      <main className="relative z-10 max-w-5xl mx-auto px-4 py-10">
        <div className="grid lg:grid-cols-2 gap-6 items-stretch">
          <section className="bg-white/8 border border-white/10 rounded-3xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl">
            <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-blue-500/15 text-blue-300 border border-blue-500/20 mb-5">
              <Shield className="h-7 w-7" />
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">Sentra Admin</h1>
            <p className="mt-3 text-slate-300 leading-relaxed">
              Review every submitted report, inspect map pins, export records, and manage all crisis submissions from one connected portal.
            </p>

            <div className="mt-6 grid sm:grid-cols-3 gap-3">
              <div className="rounded-2xl bg-black/25 border border-white/10 p-4">
                <BarChart3 className="h-5 w-5 text-blue-300" />
                <div className="mt-3 text-sm font-semibold">All Reports</div>
                <div className="text-xs text-slate-400">Every record visible</div>
              </div>
              <div className="rounded-2xl bg-black/25 border border-white/10 p-4">
                <MapPinned className="h-5 w-5 text-emerald-300" />
                <div className="mt-3 text-sm font-semibold">Map View</div>
                <div className="text-xs text-slate-400">Live report locations</div>
              </div>
              <div className="rounded-2xl bg-black/25 border border-white/10 p-4">
                <Shield className="h-5 w-5 text-amber-300" />
                <div className="mt-3 text-sm font-semibold">Connected</div>
                <div className="text-xs text-slate-400">Linked to user flow</div>
              </div>
            </div>
          </section>

          <section className="bg-white text-slate-900 rounded-3xl p-6 sm:p-8 shadow-2xl">
            <div className="flex items-center space-x-3">
              <div className="h-12 w-12 rounded-2xl bg-slate-900 text-white flex items-center justify-center">
                <LogIn className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold">Open Admin Console</h2>
                <p className="text-sm text-slate-500">Sign in or continue directly if already authenticated.</p>
              </div>
            </div>

            <div className="mt-8 space-y-4">
              <button
                type="button"
                onClick={onEnterAdmin}
                className="w-full h-14 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-lg shadow-blue-600/20 flex items-center justify-center space-x-2"
              >
                <span>{token ? 'Go to Dashboard' : 'Sign In to Admin'}</span>
              </button>

              <button
                type="button"
                onClick={onBackToUser}
                className="w-full h-14 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-900 font-bold border border-slate-200"
              >
                Back to User Page
              </button>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
