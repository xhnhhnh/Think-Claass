import type { Options } from 'canvas-confetti';

type ConfettiModule = { default: (options?: Options) => Promise<undefined> | void };

let confettiLoader: Promise<ConfettiModule> | null = null;

export async function launchConfetti(options: Options) {
  confettiLoader ??= import('canvas-confetti') as Promise<ConfettiModule>;
  const { default: confetti } = await confettiLoader;
  confetti(options);
}
