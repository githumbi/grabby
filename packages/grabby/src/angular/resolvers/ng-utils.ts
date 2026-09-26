export interface NgDebugApi {
  getComponent<T>(element: Element): T | null;
  getOwningComponent<T>(element: Element): T | null;
  getDirectives(element: Element): any[];
}

export function getNgApi(): NgDebugApi | null {
  if (typeof window === 'undefined') return null;
  return (window as any).ng || null;
}

export function cleanComponentName(name: string): string {
  return name.startsWith('_') ? name.slice(1) : name;
}
