import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'CryptoPunks',
  description: 'CryptoPunks documentation',
  themeConfig: {
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Contracts', link: '/contracts/punks-data' },
    ],
    sidebar: [
      {
        text: 'Introduction',
        items: [
          { text: 'Overview', link: '/' },
        ],
      },
      {
        text: 'Contracts',
        items: [
          { text: 'PunksData', link: '/contracts/punks-data' },
          { text: 'PunksRenderer', link: '/contracts/punks-renderer' },
        ],
      },
    ],
  },
})
