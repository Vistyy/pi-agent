export function argValue(name: string, argv = process.argv): string | undefined {
  const idx = argv.indexOf(name);
  return idx === -1 ? undefined : argv[idx + 1];
}

export function hasArg(name: string, argv = process.argv): boolean {
  return argv.includes(name);
}
