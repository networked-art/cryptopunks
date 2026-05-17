import { _ as _export_sfc, v as vueExports, e as useRoute, s as serverRenderer_cjs_prodExports, a as __nuxt_component_0$2, f as __nuxt_component_0 } from './server.mjs';
import { u as usePunksOffline } from './usePunksSdk-BxWpA43t.mjs';
import { u as useHead } from './composables-BInQ3MhD.mjs';
import { u as useActivityFeed } from './useActivityFeed-B0Q6xon9.mjs';
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
import './addresses-CS4rh6Zo.mjs';

const _sfc_main$1 = /* @__PURE__ */ vueExports.defineComponent({
  __name: "PunkImage",
  __ssrInlineRender: true,
  props: {
    punkId: {},
    size: { default: 96 },
    background: { default: "classic" },
    glitch: { default: "hover" },
    showId: { type: Boolean, default: false }
  },
  setup(__props) {
    const props = __props;
    const offline = usePunksOffline();
    const dataUri = vueExports.computed(
      () => offline.render.svgDataUri(props.punkId, {
        background: props.background
      })
    );
    const rootStyle = vueExports.computed(() => ({
      width: typeof props.size === "number" ? `${props.size}px` : props.size,
      height: typeof props.size === "number" ? `${props.size}px` : props.size
    }));
    const hovering = vueExports.ref(false);
    const burst = vueExports.ref(false);
    const glitching = vueExports.computed(() => {
      switch (props.glitch) {
        case "never":
          return false;
        case "always":
          return true;
        case "random":
          return burst.value;
        case "hover":
        default:
          return hovering.value;
      }
    });
    return (_ctx, _push, _parent, _attrs) => {
      _push(`<div${serverRenderer_cjs_prodExports.ssrRenderAttrs(vueExports.mergeProps({
        class: ["punk-image", { "is-glitching": vueExports.unref(glitching) }],
        style: vueExports.unref(rootStyle),
        title: `Punk #${__props.punkId}`
      }, _attrs))} data-v-abc13b95><img class="punk-base"${serverRenderer_cjs_prodExports.ssrRenderAttr("src", vueExports.unref(dataUri))}${serverRenderer_cjs_prodExports.ssrRenderAttr("alt", `CryptoPunk ${__props.punkId}`)} draggable="false" data-v-abc13b95>`);
      if (vueExports.unref(glitching)) {
        _push(`<img class="punk-glitch punk-glitch-r"${serverRenderer_cjs_prodExports.ssrRenderAttr("src", vueExports.unref(dataUri))} aria-hidden="true" data-v-abc13b95>`);
      } else {
        _push(`<!---->`);
      }
      if (vueExports.unref(glitching)) {
        _push(`<img class="punk-glitch punk-glitch-g"${serverRenderer_cjs_prodExports.ssrRenderAttr("src", vueExports.unref(dataUri))} aria-hidden="true" data-v-abc13b95>`);
      } else {
        _push(`<!---->`);
      }
      if (vueExports.unref(glitching)) {
        _push(`<img class="punk-glitch punk-glitch-b"${serverRenderer_cjs_prodExports.ssrRenderAttr("src", vueExports.unref(dataUri))} aria-hidden="true" data-v-abc13b95>`);
      } else {
        _push(`<!---->`);
      }
      if (__props.showId) {
        _push(`<span class="punk-image-id" data-v-abc13b95>${serverRenderer_cjs_prodExports.ssrInterpolate(__props.punkId)}</span>`);
      } else {
        _push(`<!---->`);
      }
      _push(`</div>`);
    };
  }
});
const _sfc_setup$1 = _sfc_main$1.setup;
_sfc_main$1.setup = (props, ctx) => {
  const ssrContext = vueExports.useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("components/PunkImage.vue");
  return _sfc_setup$1 ? _sfc_setup$1(props, ctx) : void 0;
};
const __nuxt_component_1 = /* @__PURE__ */ Object.assign(_export_sfc(_sfc_main$1, [["__scopeId", "data-v-abc13b95"]]), { __name: "PunkImage" });
const _sfc_main = /* @__PURE__ */ vueExports.defineComponent({
  __name: "[id]",
  __ssrInlineRender: true,
  setup(__props) {
    const route = useRoute();
    const id = vueExports.computed(() => Number(route.params.id));
    useHead(() => ({ title: `Punk #${id.value} · punksmarket.xyz` }));
    const offline = usePunksOffline();
    const summary = vueExports.computed(() => offline.get(id.value, { includeTraits: true }));
    const traits = vueExports.computed(() => summary.value.traits ?? []);
    const background = vueExports.computed(() => "classic");
    useActivityFeed({ punkId: () => id.value });
    const { bids: allBids } = usePunksMarketBids();
    vueExports.computed(
      () => allBids.value.filter((b) => {
        if (b.includeIds.length && !b.includeIds.includes(id.value)) return false;
        if (b.excludeIds.length && b.excludeIds.includes(id.value)) return false;
        return true;
      })
    );
    return (_ctx, _push, _parent, _attrs) => {
      const _component_NuxtLink = __nuxt_component_0$2;
      const _component_PunkImage = __nuxt_component_1;
      const _component_ClientOnly = __nuxt_component_0;
      _push(`<div${serverRenderer_cjs_prodExports.ssrRenderAttrs(vueExports.mergeProps({ class: "container punk-page" }, _attrs))} data-v-292de2d8>`);
      _push(serverRenderer_cjs_prodExports.ssrRenderComponent(_component_NuxtLink, {
        to: "/",
        class: "back muted"
      }, {
        default: vueExports.withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            _push2(`← back to search`);
          } else {
            return [
              vueExports.createTextVNode("← back to search")
            ];
          }
        }),
        _: 1
      }, _parent));
      _push(`<section class="hero" data-v-292de2d8><div class="hero-image" data-v-292de2d8>`);
      _push(serverRenderer_cjs_prodExports.ssrRenderComponent(_component_PunkImage, {
        "punk-id": vueExports.unref(id),
        size: 320,
        background: vueExports.unref(background),
        glitch: "random"
      }, null, _parent));
      _push(`</div><div class="hero-info" data-v-292de2d8><h1 class="hero-title" data-v-292de2d8> Punk <span class="dim" data-v-292de2d8>#</span>${serverRenderer_cjs_prodExports.ssrInterpolate(vueExports.unref(id))}</h1><p class="hero-meta" data-v-292de2d8><span class="tag" data-v-292de2d8>${serverRenderer_cjs_prodExports.ssrInterpolate(vueExports.unref(summary).punkTypeName)}</span><span class="tag" data-v-292de2d8>${serverRenderer_cjs_prodExports.ssrInterpolate(vueExports.unref(summary).attributeCount)} attribute${serverRenderer_cjs_prodExports.ssrInterpolate(vueExports.unref(summary).attributeCount === 1 ? "" : "s")}</span><span class="tag" data-v-292de2d8>${serverRenderer_cjs_prodExports.ssrInterpolate(vueExports.unref(summary).colorCount)} colors</span><span class="tag" data-v-292de2d8>${serverRenderer_cjs_prodExports.ssrInterpolate(vueExports.unref(summary).pixelCount)} px</span></p><ul class="trait-list" data-v-292de2d8><!--[-->`);
      serverRenderer_cjs_prodExports.ssrRenderList(vueExports.unref(traits), (t) => {
        _push(`<li data-v-292de2d8><span class="trait-kind" data-v-292de2d8>${serverRenderer_cjs_prodExports.ssrInterpolate(t.kind)}</span><span data-v-292de2d8>${serverRenderer_cjs_prodExports.ssrInterpolate(t.name)}</span><span class="muted trait-supply" data-v-292de2d8>${serverRenderer_cjs_prodExports.ssrInterpolate(t.supply)}</span></li>`);
      });
      _push(`<!--]--></ul>`);
      _push(serverRenderer_cjs_prodExports.ssrRenderComponent(_component_ClientOnly, null, {}, _parent));
      _push(`</div></section><section class="punk-section" data-v-292de2d8><h2 class="section-title" data-v-292de2d8>Matching collection bids</h2>`);
      _push(serverRenderer_cjs_prodExports.ssrRenderComponent(_component_ClientOnly, null, {}, _parent));
      _push(`</section><section class="punk-section" data-v-292de2d8><h2 class="section-title" data-v-292de2d8>History</h2>`);
      _push(serverRenderer_cjs_prodExports.ssrRenderComponent(_component_ClientOnly, null, {}, _parent));
      _push(`</section></div>`);
    };
  }
});
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = vueExports.useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("pages/punk/[id].vue");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const _id_ = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-292de2d8"]]);

export { _id_ as default };
//# sourceMappingURL=_id_-CktyUIs4.mjs.map
