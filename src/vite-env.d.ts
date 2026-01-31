/// <reference types="vite/client" />

declare module 'virtual:textbooks' {
  const textbooks: Array<{ slug: string; title: string; file: string }>
  export default textbooks
}
