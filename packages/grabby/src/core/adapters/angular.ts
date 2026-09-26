import type { FrameworkAdapter } from './types';
import { resolveComponent } from './angular/component-resolver';
import { resolveSource } from './angular/source-resolver';

/**
 * Names come from Angular's dev-mode `ng` debug API; locations from the
 * component source map the Grabby builders inject at build time.
 */
export const angularAdapter: FrameworkAdapter = {
  name: 'Angular',
  resolveComponent: (el) => {
    const result = resolveComponent(el);
    return result.name ? result : null;
  },
  resolveSource,
  cleanClasses: (classes) => classes.filter((c) => !c.startsWith('ng-') && !c.startsWith('_ng')),
};
