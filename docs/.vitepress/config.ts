import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'ONCHAIN CRYPTOPUNKS DATA',
  description: 'CryptoPunks documentation',
  appearance: false,
  head: [
    ['link', { rel: 'icon', type: 'image/png', href: '/favicon.png' }],
    ['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
    [
      'link',
      { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
    ],
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
        items: [{ text: 'Overview', link: '/' }],
      },
      {
        text: 'Contracts',
        items: [
          {
            text: 'PunksData',
            link: '/contracts/punks-data',
            collapsed: false,
            items: [
              {
                text: 'Core Concepts',
                link: '/contracts/punks-data/core-concepts',
              },
              { text: 'Criteria API', link: '/contracts/punks-data/criteria' },
              { text: 'Visual API', link: '/contracts/punks-data/visual' },
              {
                text: 'Indexed Pixels API',
                link: '/contracts/punks-data/indexed-pixels',
              },
              {
                text: 'Usage And Integration',
                link: '/contracts/punks-data/usage',
              },
            ],
          },
          { text: 'Punks Library', link: '/contracts/punks-library' },
          { text: 'PunksRenderer', link: '/contracts/punks-renderer' },
          { text: 'PunksMarket', link: '/contracts/punks-market' },
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
              {
                text: 'Original Marketplace',
                link: '/sdk/original-marketplace',
              },
              { text: 'V1 Market', link: '/sdk/v1-market' },
              { text: 'Punk Data Contracts', link: '/sdk/punk-data-contracts' },
              { text: 'Wrappers', link: '/sdk/wrappers' },
              { text: 'Stash', link: '/sdk/stash' },
              { text: 'Stash Bids', link: '/sdk/stash-bids' },
              { text: 'Offers And Auctions', link: '/sdk/offers-and-auctions' },
              { text: 'Utilities And Caching', link: '/sdk/utilities' },
            ],
          },
        ],
      },
    ],
  },
})
