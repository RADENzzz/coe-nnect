export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-low">
      <div className="card w-full max-w-md p-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-primary">CoE-NNECT</h1>
          <p className="text-sm text-on-surface-variant mt-2">
            College of Engineering Scheduling System
          </p>
        </div>

        <form className="space-y-4">
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

          <button type="button" className="btn-primary w-full mt-2">
            Sign In
          </button>
        </form>

        <p className="text-xs text-center text-on-surface-variant mt-6">
          Western Mindanao State University
        </p>
      </div>
    </div>
  );
}