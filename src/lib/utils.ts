export async function sleepMs(ms = 1) {
  return new Promise((r) => setTimeout(r, ms));
}
