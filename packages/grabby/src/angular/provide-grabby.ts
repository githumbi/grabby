import {
  InjectionToken,
  makeEnvironmentProviders,
  provideEnvironmentInitializer,
  type EnvironmentProviders,
} from '@angular/core';
import type { GrabbyOptions, GrabbyAPI } from '../core';
import { initGrabby } from './grabby.service';

export const GRABBY_API = new InjectionToken<GrabbyAPI>('GRABBY_API');

export function provideGrabby(
  options?: Partial<GrabbyOptions>,
): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: GRABBY_API,
      useFactory: () => initGrabby(options),
    },
    provideEnvironmentInitializer(() => initGrabby(options)),
  ]);
}
