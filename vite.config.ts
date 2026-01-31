import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import { textbooksPlugin } from './src/plugins/vite-plugin-textbooks'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    textbooksPlugin(),
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/pdfjs-dist/cmaps/*',
          dest: 'cmaps',
        },
        {
          src: 'node_modules/pdfjs-dist/standard_fonts/*',
          dest: 'standard_fonts',
        },
      ],
    }),
  ],
})
