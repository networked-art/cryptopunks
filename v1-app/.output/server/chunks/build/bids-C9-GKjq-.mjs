import { _ as _export_sfc, v as vueExports, s as serverRenderer_cjs_prodExports, f as __nuxt_component_0 } from './server.mjs';
import { u as useHead } from './composables-BInQ3MhD.mjs';
import { u as usePunksMarketAddress } from './addresses-CS4rh6Zo.mjs';
import { u as usePunksMarketBids } from './usePunksMarketBids-D9ndgRZI.mjs';
import '../../index.mjs';
import 'node:crypto';
import 'node:cluster';
import 'node:os';
import 'node:http';
import 'node:https';
import 'node:events';
import 'node:buffer';
import 'node:fs';
import 'node:path';
import 'node:url';
import '@iconify/utils';
import 'consola';
import '@wagmi/core';
import 'viem';
import 'viem/chains';
import 'node:stream';
import '../routes/renderer.mjs';
import 'vue-bundle-renderer/runtime';
import 'vue/server-renderer';
import 'unhead/server';
import 'devalue';
import 'unhead/utils';
import 'vue';

const _sfc_main = /* @__PURE__ */ vueExports.defineComponent({
  __name: "bids",
  __ssrInlineRender: true,
  setup(__props) {
    useHead({ title: "Bids · punksmarket.xyz" });
    const marketAddress = usePunksMarketAddress();
    usePunksMarketBids();
    return (_ctx, _push, _parent, _attrs) => {
      const _component_ClientOnly = __nuxt_component_0;
      _push(`<div${serverRenderer_cjs_prodExports.ssrRenderAttrs(vueExports.mergeProps({ class: "container bids-page" }, _attrs))} data-v-1d08f138><header class="page-head" data-v-1d08f138><h1 data-v-1d08f138>Collection bids</h1><p class="muted" data-v-1d08f138>Open ETH bids on the PunksMarket bid book. Any holder of a matching V1 punk can accept.</p></header>`);
      if (!vueExports.unref(marketAddress)) {
        _push(`<div class="empty" data-v-1d08f138><p class="muted" data-v-1d08f138>No PunksMarket contract configured.</p><p class="dim" data-v-1d08f138>Set <code data-v-1d08f138>NUXT_PUBLIC_PUNKS_MARKET_ADDRESS</code> in the environment.</p></div>`);
      } else {
        _push(`<!---->`);
      }
      _push(serverRenderer_cjs_prodExports.ssrRenderComponent(_component_ClientOnly, null, {}, _parent));
      _push(`</div>`);
    };
  }
});
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = vueExports.useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("pages/bids.vue");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const bids = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-1d08f138"]]);

export { bids as default };
//# sourceMappingURL=bids-C9-GKjq-.mjs.map
