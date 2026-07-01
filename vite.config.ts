import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// `base: "./"` emits relative asset URLs so the static build works under any
// nsite host path (`http://<host>.nsite/`), not just the domain root.
export default defineConfig({
  base: "./",
  plugins: [react()],
});
