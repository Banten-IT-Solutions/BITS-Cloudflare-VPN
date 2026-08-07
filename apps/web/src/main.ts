import Alpine from "alpinejs";
import { appStore } from "./store";
import "./style.css";

window.Alpine = Alpine;

// Register the store used by x-data="appStore()" in index.html
Alpine.data("appStore", appStore);

Alpine.start();

declare global {
  interface Window {
    Alpine: typeof Alpine;
  }
}

export {};