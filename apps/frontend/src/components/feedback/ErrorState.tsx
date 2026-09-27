export default function ErrorState({
  message = 'Something went wrong.',
}: {
  message?: string;
}) {
  return (
    <div className="text-center py-12">
      <p className="text-red-600 font-medium">{message}</p>
    </div>
  );
}