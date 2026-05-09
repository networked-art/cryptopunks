import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'ONCHAIN CRYPTOPUNKS DATA',
  description: 'CryptoPunks documentation',
  appearance: false,
  head: [
    ['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
    ['link', { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' }],
    [
      'link',
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400;500;600;700&display=swap',
      },
    ],
  ],
  themeConfig: {
    aside: false,
    nav: [
      { text: 'punksdata.eth', link: 'https://evm.now/address/punksdata.eth' },
    ],
    outline: false,
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
