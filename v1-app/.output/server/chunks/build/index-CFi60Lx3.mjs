import { _ as _export_sfc, v as vueExports, s as serverRenderer_cjs_prodExports, h as useRouter, q as qe$1, t as tn$1, a as __nuxt_component_0$2 } from './server.mjs';
import { u as usePunksOffline } from './usePunksSdk-BxWpA43t.mjs';
import { u as useHead } from './composables-BInQ3MhD.mjs';
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

const SPRITE_COLS = 100;
const _sfc_main$2 = /* @__PURE__ */ vueExports.defineComponent({
  __name: "PunkGrid",
  __ssrInlineRender: true,
  props: {
    ids: {},
    size: { default: 56 },
    gap: { default: 2 },
    overscan: { default: 6 }
  },
  setup(__props) {
    const props = __props;
    const cell = vueExports.computed(() => props.size + props.gap);
    const containerRef = vueExports.ref(null);
    const scrollTop = vueExports.ref(0);
    const width = vueExports.ref(800);
    const height = vueExports.ref(600);
    const cols = vueExports.computed(() => Math.max(1, Math.floor(width.value / cell.value)));
    const rows = vueExports.computed(() => Math.ceil(props.ids.length / cols.value));
    const totalHeight = vueExports.computed(() => rows.value * cell.value);
    const start = vueExports.computed(
      () => Math.max(0, Math.floor(scrollTop.value / cell.value) - props.overscan)
    );
    const end = vueExports.computed(
      () => Math.min(
        rows.value,
        Math.ceil((scrollTop.value + height.value) / cell.value) + props.overscan
      )
    );
    const visible = vueExports.computed(() => {
      const out = [];
      for (let r = start.value; r < end.value; r++) {
        for (let c = 0; c < cols.value; c++) {
          const i = r * cols.value + c;
          if (i >= props.ids.length) break;
          out.push({ id: props.ids[i], row: r, col: c });
        }
      }
      return out;
    });
    vueExports.watch(() => props.ids, () => {
      scrollTop.value = 0;
      if (containerRef.value) containerRef.value.scrollTop = 0;
    });
    function cellStyle(c) {
      const spriteRow = Math.floor(c.id / SPRITE_COLS);
      const spriteCol = c.id % SPRITE_COLS;
      const px = props.size;
      return {
        top: `${c.row * cell.value}px`,
        left: `${c.col * cell.value}px`,
        width: `${px}px`,
        height: `${px}px`,
        backgroundImage: "url('/punks.png')",
        backgroundSize: `${SPRITE_COLS * px}px ${SPRITE_COLS * px}px`,
        backgroundPosition: `-${spriteCol * px}px -${spriteRow * px}px`
      };
    }
    return (_ctx, _push, _parent, _attrs) => {
      const _component_NuxtLink = __nuxt_component_0$2;
      _push(`<div${serverRenderer_cjs_prodExports.ssrRenderAttrs(vueExports.mergeProps({
        ref_key: "containerRef",
        ref: containerRef,
        class: "punk-grid"
      }, _attrs))} data-v-ea32de9e>`);
      if (__props.ids.length === 0) {
        _push(`<div class="empty" data-v-ea32de9e>No punks match.</div>`);
      } else {
        _push(`<div class="grid-scroll" style="${serverRenderer_cjs_prodExports.ssrRenderStyle({ height: vueExports.unref(totalHeight) + "px" })}" data-v-ea32de9e><!--[-->`);
        serverRenderer_cjs_prodExports.ssrRenderList(vueExports.unref(visible), (cell2) => {
          _push(serverRenderer_cjs_prodExports.ssrRenderComponent(_component_NuxtLink, {
            key: cell2.id,
            to: `/punk/${cell2.id}`,
            class: "cell",
            style: cellStyle(cell2),
            title: `Punk #${cell2.id}`
          }, {
            default: vueExports.withCtx((_, _push2, _parent2, _scopeId) => {
              if (_push2) {
                _push2(`<span class="cell-id" data-v-ea32de9e${_scopeId}>${serverRenderer_cjs_prodExports.ssrInterpolate(cell2.id)}</span>`);
              } else {
                return [
                  vueExports.createVNode("span", { class: "cell-id" }, vueExports.toDisplayString(cell2.id), 1)
                ];
              }
            }),
            _: 2
          }, _parent));
        });
        _push(`<!--]--></div>`);
      }
      _push(`</div>`);
    };
  }
});
const _sfc_setup$2 = _sfc_main$2.setup;
_sfc_main$2.setup = (props, ctx) => {
  const ssrContext = vueExports.useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("components/PunkGrid.vue");
  return _sfc_setup$2 ? _sfc_setup$2(props, ctx) : void 0;
};
const __nuxt_component_0$1 = /* @__PURE__ */ Object.assign(_export_sfc(_sfc_main$2, [["__scopeId", "data-v-ea32de9e"]]), { __name: "PunkGrid" });
const _sfc_main$1 = /* @__PURE__ */ vueExports.defineComponent({
  __name: "PunkSearch",
  __ssrInlineRender: true,
  props: {
    size: { default: 56 },
    hideFilters: { type: Boolean, default: false },
    filtersOpen: { type: Boolean, default: false },
    baseQuery: {}
  },
  setup(__props) {
    const props = __props;
    const offline = usePunksOffline();
    useRouter();
    const text = vueExports.ref("");
    const sort = vueExports.ref("id");
    const punkTypes = Object.keys(qe$1).filter((k) => isNaN(Number(k)));
    const headVariants = Object.keys(tn$1).filter((k) => isNaN(Number(k)));
    const selectedTypes = vueExports.reactive(/* @__PURE__ */ new Set());
    const selectedHeads = vueExports.reactive(/* @__PURE__ */ new Set());
    const requiredTraitsText = vueExports.ref("");
    const forbiddenTraitsText = vueExports.ref("");
    const query = vueExports.computed(() => {
      const required = parseList(requiredTraitsText.value);
      const forbidden = parseList(forbiddenTraitsText.value);
      return {
        ...props.baseQuery,
        text: text.value.trim() || void 0,
        type: selectedTypes.size ? [...selectedTypes] : void 0,
        head: selectedHeads.size ? [...selectedHeads] : void 0,
        attributes: required.length || forbidden.length ? { required, forbidden } : void 0,
        sort: sort.value,
        limit: 5e3
      };
    });
    const ids = vueExports.computed(() => {
      try {
        return offline.search(query.value);
      } catch {
        return [];
      }
    });
    const counts = vueExports.computed(() => ({
      total: offline.dataset.count(props.baseQuery),
      filtered: ids.value.length
    }));
    const activeFilterCount = vueExports.computed(() => {
      let n = 0;
      if (selectedTypes.size) n++;
      if (selectedHeads.size) n++;
      if (requiredTraitsText.value.trim()) n++;
      if (forbiddenTraitsText.value.trim()) n++;
      return n;
    });
    function parseList(input) {
      return input.split(",").map((s) => s.trim()).filter(Boolean);
    }
    return (_ctx, _push, _parent, _attrs) => {
      const _component_PunkGrid = __nuxt_component_0$1;
      _push(`<section${serverRenderer_cjs_prodExports.ssrRenderAttrs(vueExports.mergeProps({ class: "punk-search" }, _attrs))} data-v-f7cf31f3><header class="search-bar" data-v-f7cf31f3><input${serverRenderer_cjs_prodExports.ssrRenderAttr("value", vueExports.unref(text))} type="search" class="search-input"${serverRenderer_cjs_prodExports.ssrRenderAttr("placeholder", `Search ${vueExports.unref(counts).total.toLocaleString()} punks by id, type, or trait…`)} data-v-f7cf31f3><select class="sort" data-v-f7cf31f3><option value="id" data-v-f7cf31f3${serverRenderer_cjs_prodExports.ssrIncludeBooleanAttr(Array.isArray(vueExports.unref(sort)) ? serverRenderer_cjs_prodExports.ssrLooseContain(vueExports.unref(sort), "id") : serverRenderer_cjs_prodExports.ssrLooseEqual(vueExports.unref(sort), "id")) ? " selected" : ""}>Id ↑</option><option value="id-desc" data-v-f7cf31f3${serverRenderer_cjs_prodExports.ssrIncludeBooleanAttr(Array.isArray(vueExports.unref(sort)) ? serverRenderer_cjs_prodExports.ssrLooseContain(vueExports.unref(sort), "id-desc") : serverRenderer_cjs_prodExports.ssrLooseEqual(vueExports.unref(sort), "id-desc")) ? " selected" : ""}>Id ↓</option><option value="rarity" data-v-f7cf31f3${serverRenderer_cjs_prodExports.ssrIncludeBooleanAttr(Array.isArray(vueExports.unref(sort)) ? serverRenderer_cjs_prodExports.ssrLooseContain(vueExports.unref(sort), "rarity") : serverRenderer_cjs_prodExports.ssrLooseEqual(vueExports.unref(sort), "rarity")) ? " selected" : ""}>Rarest</option><option value="rarity-desc" data-v-f7cf31f3${serverRenderer_cjs_prodExports.ssrIncludeBooleanAttr(Array.isArray(vueExports.unref(sort)) ? serverRenderer_cjs_prodExports.ssrLooseContain(vueExports.unref(sort), "rarity-desc") : serverRenderer_cjs_prodExports.ssrLooseEqual(vueExports.unref(sort), "rarity-desc")) ? " selected" : ""}>Most common</option><option value="pixelCount-desc" data-v-f7cf31f3${serverRenderer_cjs_prodExports.ssrIncludeBooleanAttr(Array.isArray(vueExports.unref(sort)) ? serverRenderer_cjs_prodExports.ssrLooseContain(vueExports.unref(sort), "pixelCount-desc") : serverRenderer_cjs_prodExports.ssrLooseEqual(vueExports.unref(sort), "pixelCount-desc")) ? " selected" : ""}>Most pixels</option><option value="colorCount-desc" data-v-f7cf31f3${serverRenderer_cjs_prodExports.ssrIncludeBooleanAttr(Array.isArray(vueExports.unref(sort)) ? serverRenderer_cjs_prodExports.ssrLooseContain(vueExports.unref(sort), "colorCount-desc") : serverRenderer_cjs_prodExports.ssrLooseEqual(vueExports.unref(sort), "colorCount-desc")) ? " selected" : ""}>Most colors</option></select><span class="muted result-count" data-v-f7cf31f3>${serverRenderer_cjs_prodExports.ssrInterpolate(vueExports.unref(counts).filtered.toLocaleString())} / ${serverRenderer_cjs_prodExports.ssrInterpolate(vueExports.unref(counts).total.toLocaleString())}</span></header>`);
      if (!__props.hideFilters) {
        _push(`<details class="filters"${serverRenderer_cjs_prodExports.ssrIncludeBooleanAttr(__props.filtersOpen) ? " open" : ""} data-v-f7cf31f3><summary data-v-f7cf31f3>Filters · ${serverRenderer_cjs_prodExports.ssrInterpolate(vueExports.unref(activeFilterCount))} active</summary><div class="filter-grid" data-v-f7cf31f3><div data-v-f7cf31f3><label class="filter-label" data-v-f7cf31f3>Type</label><div class="chips" data-v-f7cf31f3><!--[-->`);
        serverRenderer_cjs_prodExports.ssrRenderList(vueExports.unref(punkTypes), (t) => {
          _push(`<button type="button" class="${serverRenderer_cjs_prodExports.ssrRenderClass([{ active: vueExports.unref(selectedTypes).has(t) }, "chip"])}" data-v-f7cf31f3>${serverRenderer_cjs_prodExports.ssrInterpolate(t)}</button>`);
        });
        _push(`<!--]--></div></div><div data-v-f7cf31f3><label class="filter-label" data-v-f7cf31f3>Head variant</label><div class="chips" data-v-f7cf31f3><!--[-->`);
        serverRenderer_cjs_prodExports.ssrRenderList(vueExports.unref(headVariants), (h) => {
          _push(`<button type="button" class="${serverRenderer_cjs_prodExports.ssrRenderClass([{ active: vueExports.unref(selectedHeads).has(h) }, "chip"])}" data-v-f7cf31f3>${serverRenderer_cjs_prodExports.ssrInterpolate(h)}</button>`);
        });
        _push(`<!--]--></div></div><div class="full" data-v-f7cf31f3><label class="filter-label" data-v-f7cf31f3>Required traits</label><input${serverRenderer_cjs_prodExports.ssrRenderAttr("value", vueExports.unref(requiredTraitsText))} type="text" placeholder="hoodie, 3d glasses, …" data-v-f7cf31f3></div><div class="full" data-v-f7cf31f3><label class="filter-label" data-v-f7cf31f3>Forbidden traits</label><input${serverRenderer_cjs_prodExports.ssrRenderAttr("value", vueExports.unref(forbiddenTraitsText))} type="text" placeholder="cigarette, …" data-v-f7cf31f3></div></div></details>`);
      } else {
        _push(`<!---->`);
      }
      _push(serverRenderer_cjs_prodExports.ssrRenderComponent(_component_PunkGrid, {
        ids: vueExports.unref(ids),
        size: __props.size
      }, null, _parent));
      _push(`</section>`);
    };
  }
});
const _sfc_setup$1 = _sfc_main$1.setup;
_sfc_main$1.setup = (props, ctx) => {
  const ssrContext = vueExports.useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("components/PunkSearch.vue");
  return _sfc_setup$1 ? _sfc_setup$1(props, ctx) : void 0;
};
const __nuxt_component_0 = /* @__PURE__ */ Object.assign(_export_sfc(_sfc_main$1, [["__scopeId", "data-v-f7cf31f3"]]), { __name: "PunkSearch" });
const _sfc_main = /* @__PURE__ */ vueExports.defineComponent({
  __name: "index",
  __ssrInlineRender: true,
  setup(__props) {
    useHead({ title: "Search · punksmarket.xyz" });
    return (_ctx, _push, _parent, _attrs) => {
      const _component_PunkSearch = __nuxt_component_0;
      _push(`<div${serverRenderer_cjs_prodExports.ssrRenderAttrs(vueExports.mergeProps({ class: "container search-page" }, _attrs))} data-v-f2677bbb>`);
      _push(serverRenderer_cjs_prodExports.ssrRenderComponent(_component_PunkSearch, {
        size: 56,
        "filters-open": ""
      }, null, _parent));
      _push(`</div>`);
    };
  }
});
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = vueExports.useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("pages/index.vue");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const index = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-f2677bbb"]]);

export { index as default };
//# sourceMappingURL=index-CFi60Lx3.mjs.map
