export default function LoadingState({
  message = 'Loading...',
}: {
  message?: string;
}) {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent"></div>
      <span className="ml-3 text-on-surface-variant text-sm">{message}</span>
    </div>
  );
}