import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function LoginPage() {
  const navigate = useNavigate();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    navigate('/dashboard');
  };


  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-low">
      <div className="card w-full max-w-md p-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-primary">CoE-NNECT</h1>
          <p className="text-sm text-on-surface-variant mt-2">
            College of Engineering Scheduling System
          </p>
        </div>

        <form className="space-y-4" onSubmit={handleLogin}>
          <div>
            <label className="label block mb-2">
              Email or Username
            </label>
            <input
              type="text"
              className="input"
              placeholder="you@wmsu.edu.ph"
            />
          </div>

          <div>
            <label className="label block mb-2">
              Password
            </label>
            <input
              type="password"
              className="input"
              placeholder="••••••••"
            />
          </div>

          <button type="submit" className="btn-primary w-full mt-2">
            Login
          </button>
        </form>

        <p className="text-xs text-center text-on-surface-variant mt-6">
          Western Mindanao State University
        </p>
      </div>
    </div>
  );
}