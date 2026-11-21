export function waitForMinimumLoginAnimation(
  durationMs = 420,
): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}
