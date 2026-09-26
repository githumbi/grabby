import type { FrameworkAdapter, ComponentResult, SourceResult } from './types';
import { NO_SOURCE, relativizePath, baseName } from './types';

/*
 * Vue 3 puts the owning component instance on every element it renders as
 * `__vueParentComponent` (dev builds, or prod with __VUE_PROD_DEVTOOLS__).
 * Vue 2 puts the instance on its root element as `__vue__`.
 */

interface Vue3Instance {
  type: { __name?: string; name?: string; displayName?: string; __file?: string };
  parent: Vue3Instance | null;
  vnode?: { el?: Node | null };
  subTree?: { el?: Node | null };
}

interface Vue2Instance {
  $options: { name?: string; _componentTag?: string; __file?: string };
  $parent: Vue2Instance | null;
  $el?: Node;
}

/** Built-ins that wrap the user's components without being one of them. */
const VUE_INTERNALS = new Set(['KeepAlive', 'Transition', 'TransitionGroup', 'Teleport', 'Suspense', 'BaseTransition', 'RouterView', 'RouterLink']);
const MAX_STACK = 12;

function firstElement(node: Node | null | undefined): Element | null {
  let current: Node | null = node ?? null;
  while (current && current.nodeType !== Node.ELEMENT_NODE) current = current.nextSibling;
  return current as Element | null;
}

function vue3Owner(el: Element): Vue3Instance | null {
  let current: Element | null = el;
  while (current) {
    const inst = (current as unknown as { __vueParentComponent?: Vue3Instance }).__vueParentComponent;
    if (inst) return inst;
    current = current.parentElement;
  }
  return null;
}

function vue3Name(inst: Vue3Instance): string | null {
  const t = inst.type ?? {};
  return t.__name || t.name || t.displayName || (t.__file ? baseName(t.__file) : null);
}

function vue3Host(inst: Vue3Instance): Element | null {
  return firstElement(inst.subTree?.el ?? inst.vnode?.el);
}

function vue2Owner(el: Element): Vue2Instance | null {
  let current: Element | null = el;
  while (current) {
    const vm = (current as unknown as { __vue__?: Vue2Instance }).__vue__;
    if (vm) return vm;
    current = current.parentElement;
  }
  return null;
}

function vue2Name(vm: Vue2Instance): string | null {
  const o = vm.$options ?? {};
  return o.name || o._componentTag || (o.__file ? baseName(o.__file) : null);
}

function resolveVueComponent(el: Element): ComponentResult | null {
  const inst3 = vue3Owner(el);
  if (inst3) {
    const stack: ComponentResult['stack'] = [];
    for (let i: Vue3Instance | null = inst3; i && stack!.length < MAX_STACK; i = i.parent) {
      const name = vue3Name(i);
      if (name && !VUE_INTERNALS.has(name)) stack!.push({ name, hostElement: vue3Host(i) });
    }
    const first = stack![0];
    return first ? { name: first.name, hostElement: first.hostElement, stack } : null;
  }

  const vm = vue2Owner(el);
  if (vm) {
    const stack: ComponentResult['stack'] = [];
    for (let v: Vue2Instance | null = vm; v && stack!.length < MAX_STACK; v = v.$parent) {
      const name = vue2Name(v);
      if (name && !VUE_INTERNALS.has(name)) stack!.push({ name, hostElement: firstElement(v.$el) });
    }
    const first = stack![0];
    return first ? { name: first.name, hostElement: first.hostElement, stack } : null;
  }
  return null;
}

/** File-level location from the component definition (`__file`). */
function resolveVueSource(el: Element): SourceResult {
  const inst3 = vue3Owner(el);
  const file = inst3?.type?.__file ?? vue2Owner(el)?.$options?.__file;
  return file ? { filePath: relativizePath(file), line: null, column: null } : NO_SOURCE;
}

export const vueAdapter: FrameworkAdapter = {
  name: 'Vue',
  resolveComponent: resolveVueComponent,
  resolveSource: resolveVueSource,
  // Scoped-style hashes live in data-v-* attributes, not classes, so nothing to drop.
};
