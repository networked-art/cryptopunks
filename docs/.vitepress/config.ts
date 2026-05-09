import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'CryptoPunks',
  description: 'CryptoPunks documentation',
  themeConfig: {
    nav: [
      { text: 'Home', link: '/' },
    ],
    sidebar: [
      {
        text: 'Introduction',
        items: [
          { text: 'Overview', link: '/' },
        ],
      },
    ],
  },
})
