/**
 * The comment formatter on its own, with no DOM code, for Node consumers
 * such as @githumbi/grabby-server.
 */
export { formatExport, estimateTokens, authorLabel, type ExportEnv } from './core/capture/export';
export type {
  GrabbyComment,
  GrabbyTarget,
  TargetKind,
  DetailLevel,
  CommentAuthor,
  PageInfo,
  ScreenshotRef,
  SourceLocation,
  StackFrame,
} from './core/types';
