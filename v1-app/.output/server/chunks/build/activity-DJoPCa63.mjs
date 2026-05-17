import { _ as _export_sfc, v as vueExports, s as serverRenderer_cjs_prodExports, f as __nuxt_component_0 } from './server.mjs';
import { u as useHead } from './composables-BInQ3MhD.mjs';
import { u as useActivityFeed } from './useActivityFeed-B0Q6xon9.mjs';
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
import './addresses-CS4rh6Zo.mjs';

const _sfc_main = /* @__PURE__ */ vueExports.defineComponent({
  __name: "activity",
  __ssrInlineRender: true,
  setup(__props) {
    useHead({ title: "Activity · punksmarket.xyz" });
    useActivityFeed();
    return (_ctx, _push, _parent, _attrs) => {
      const _component_ClientOnly = __nuxt_component_0;
      _push(`<div${serverRenderer_cjs_prodExports.ssrRenderAttrs(vueExports.mergeProps({ class: "container activity-page" }, _attrs))} data-v-5af6d26a><header class="page-head" data-v-5af6d26a><h1 data-v-5af6d26a>Activity</h1><p class="muted" data-v-5af6d26a>Recent V1 listings, sales, and bids across the original market and PunksMarket.</p></header>`);
      _push(serverRenderer_cjs_prodExports.ssrRenderComponent(_component_ClientOnly, null, {}, _parent));
      _push(`</div>`);
    };
  }
});
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = vueExports.useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("pages/activity.vue");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const activity = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-5af6d26a"]]);

export { activity as default };
//# sourceMappingURL=activity-DJoPCa63.mjs.map
