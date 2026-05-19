import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'PUNKS SDK',
  description:
    'Developer documentation for the CryptoPunks data, renderer, and market contracts, plus the TypeScript SDK that wraps them.',
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
      { text: 'github', link: 'https://github.com/networked-art/cryptopunks' },
      { text: 'punksmarket.app', link: 'https://punksmarket.app' },
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
                text: 'Filter Library',
                link: '/contracts/punks-data/filter-library',
              },
              {
                text: 'Usage And Integration',
                link: '/contracts/punks-data/usage',
              },
            ],
          },
          { text: 'PunksRenderer', link: '/contracts/punks-renderer' },
          {
            text: 'PunksMarket',
            link: '/contracts/punks-market',
            collapsed: false,
            items: [
              { text: 'Reference', link: '/contracts/punks-market/reference' },
              {
                text: 'UnwrapV1Punks',
                link: '/contracts/punks-market/unwrap-v1-punks',
              },
            ],
          },
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
              { text: 'V1 Wrapper', link: '/sdk/v1-wrapper' },
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
