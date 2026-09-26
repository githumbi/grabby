// Resolvers
export { resolveComponent } from '../core/adapters/angular/component-resolver';
export { resolveSource } from '../core/adapters/angular/source-resolver';
export { angularAdapter } from '../core';

// Angular integration
export {
  initGrabby,
  getGrabbyApi,
  registerGrabbyPlugin,
  disposeGrabby,
} from './grabby.service';
export { provideGrabby, GRABBY_API } from './provide-grabby';
