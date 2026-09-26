import { mount } from 'svelte';
import { initGrabby } from '@githumbi/grabby';
import App from './App.svelte';

if (import.meta.env.DEV) initGrabby();

mount(App, { target: document.getElementById('app') });
