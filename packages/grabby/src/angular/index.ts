// Resolvers
export { resolveComponent } from './resolvers/component-resolver';
export { resolveSource } from './resolvers/source-resolver';
export { buildContext } from './resolvers/context-builder';

// Angular integration
export {
  initGrabby,
  getGrabbyApi,
  registerGrabbyPlugin,
  disposeGrabby,
} from './grabby.service';
export { provideGrabby, GRABBY_API } from './provide-grabby';
