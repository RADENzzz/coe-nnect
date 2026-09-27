export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-900 to-blue-700">
      <div className="bg-white rounded-lg shadow-2xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-blue-900">CoE-NNECT</h1>
          <p className="text-sm text-slate-600 mt-2">
            College of Engineering Scheduling System
          </p>
        </div>
        <form className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Email or Username
            </label>
            <input
              type="text"
              className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="you@wmsu.edu.ph"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Password
            </label>
            <input
              type="password"
              className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="••••••••"
            />
          </div>
          <button
            type="button"
            className="w-full bg-blue-900 hover:bg-blue-800 text-white font-medium py-2 rounded-md transition"
          >
            Sign In
          </button>
        </form>
        <p className="text-xs text-center text-slate-500 mt-6">
          Western Mindanao State University
        </p>
      </div>
    </div>
  );
}