import { ContentStatus, Platform } from "./types";

export const WORKER_URL = "https://gestion-luminose-worker.luminose.workers.dev";

export const STATUS_COLORS: Record<ContentStatus, string> = {
  [ContentStatus.IDEA]: "bg-gray-100 text-gray-700 border-gray-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
  [ContentStatus.DRAFTING]: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800",
  [ContentStatus.READY]: "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800",
  [ContentStatus.PUBLISHED]: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800",
};