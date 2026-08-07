declare module "alpinejs" {
  interface AlpineStore {
    start: () => void;
    data: (name: string, component: (...args: unknown[]) => unknown) => void;
  }
  const Alpine: AlpineStore;
  export default Alpine;
}