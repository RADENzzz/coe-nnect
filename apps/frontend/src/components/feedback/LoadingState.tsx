export default function LoadingState({ message = 'Loading...' }: { message?: string }) {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-900"></div>
      <span className="ml-3 text-slate-500">{message}</span>
    </div>
  );
}