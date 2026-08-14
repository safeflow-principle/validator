/// <reference types="vite/client" />

declare module "*.jsonl?raw" {
  const contents: string;
  export default contents;
}
