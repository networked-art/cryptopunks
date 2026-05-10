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
          {
            text: 'PunksData',
            link: '/contracts/punks-data',
            collapsed: false,
            items: [
              { text: 'Core Concepts', link: '/contracts/punks-data/core-concepts' },
              { text: 'Criteria API', link: '/contracts/punks-data/criteria' },
              { text: 'Visual API', link: '/contracts/punks-data/visual' },
              { text: 'Indexed Pixels API', link: '/contracts/punks-data/indexed-pixels' },
              { text: 'Loader And Storage API', link: '/contracts/punks-data/loader-storage' },
              { text: 'Usage And Integration', link: '/contracts/punks-data/usage' },
            ],
          },
          { text: 'PunksRenderer', link: '/contracts/punks-renderer' },
        ],
      },
      {
        text: 'SDK',
        items: [
          {
            text: 'TypeScript SDK',
            link: '/sdk',
            collapsed: false,
            items: [
              { text: 'Data And Search', link: '/sdk/data-search' },
              { text: 'Rendering And Metadata', link: '/sdk/rendering' },
              { text: 'Utilities And Caching', link: '/sdk/utilities' },
            ],
          },
        ],
      },
    ],
  },
})
