/** Matches core's ComponentStackEntry */
export interface ComponentStackEntry {
  name: string;
  filePath: string | null;
  line: number | null;
  column: number | null;
}

/** Matches core's HistoryContext */
export interface GrabContext {
  html: string;
  componentName: string | null;
  filePath: string | null;
  line: number | null;
  column: number | null;
  componentStack: ComponentStackEntry[];
  selector: string;
  cssClasses: string[];
}

/** Matches core's HistoryEntry */
export interface GrabEntry {
  id: string;
  context: GrabContext;
  snippet: string;
  timestamp: number;
}

export interface GrabHistory {
  entries: GrabEntry[];
  maxEntries: number;
}
