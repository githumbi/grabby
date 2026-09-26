import type { FrameworkAdapter } from './types';
import { resolveComponent } from './react/component-resolver';

/** Names come from the React fiber; locations come from build-time stamps. */
export const reactAdapter: FrameworkAdapter = {
  name: 'React',
  resolveComponent: (el) => {
    const result = resolveComponent(el);
    return result.name ? result : null;
  },
};
