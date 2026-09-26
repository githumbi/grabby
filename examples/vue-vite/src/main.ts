import { createApp } from 'vue';
import { initGrabby } from '@githumbi/grabby';
import App from './App.vue';

if (import.meta.env.DEV) initGrabby();

createApp(App).mount('#app');
