export function getModalBackdropClassName(blurBackdrop: boolean): string {
  const classes = ['absolute inset-0 bg-black/60'];
  if (blurBackdrop) classes.push('backdrop-blur-sm');
  classes.push('animate-backdrop-in');
  return classes.join(' ');
}
