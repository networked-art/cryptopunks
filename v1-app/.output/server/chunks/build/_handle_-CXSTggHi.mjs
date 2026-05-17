import { _ as _export_sfc, v as vueExports, e as useRoute, b as useConfig, s as serverRenderer_cjs_prodExports, f as __nuxt_component_0, c as useEvmConfig, d as useRuntimeConfig } from './server.mjs';
import { getPublicClient } from '@wagmi/core';
import { isAddress } from 'viem';
import { u as useHead } from './composables-BInQ3MhD.mjs';
import { u as usePunksMarketBids } from './usePunksMarketBids-D9ndgRZI.mjs';
import { u as useActivityFeed } from './useActivityFeed-B0Q6xon9.mjs';
import { normalize } from 'viem/ens';
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

function createCache(ttl, max) {
  const entries = /* @__PURE__ */ new Map();
  const pending = /* @__PURE__ */ new Map();
  function prune() {
    const now = Date.now();
    for (const [key, entry] of entries) {
      if (entry.expiresAt <= now) entries.delete(key);
    }
    if (entries.size > max) {
      const excess = entries.size - max;
      const keys = entries.keys();
      for (let i = 0; i < excess; i++) {
        entries.delete(keys.next().value);
      }
    }
  }
  function get(key) {
    const entry = entries.get(key);
    if (!entry) return void 0;
    if (entry.expiresAt <= Date.now()) {
      entries.delete(key);
      return void 0;
    }
    entries.delete(key);
    entries.set(key, entry);
    return entry.data;
  }
  function fetch2(key, fn) {
    const cached = get(key);
    if (cached) return Promise.resolve(cached);
    const inflight = pending.get(key);
    if (inflight) return inflight;
    const promise = fn().then((result) => {
      entries.set(key, { data: result, expiresAt: Date.now() + ttl });
      pending.delete(key);
      if (entries.size > max) prune();
      return result;
    }).catch((err) => {
      pending.delete(key);
      throw err;
    });
    pending.set(key, promise);
    return promise;
  }
  return { get, fetch: fetch2 };
}
const shortAddress = (address, length = 3) => address.substring(0, length + 2) + "..." + address.substring(address.length - length);
const ENS_KEYS_AVATAR = ["avatar"];
const ensCache = createCache(5 * 60 * 1e3, 500);
async function fetchEnsFromIndexer(identifier, urls) {
  let lastError;
  for (const url of urls) {
    try {
      const res = await fetch(`${url}/${identifier}`);
      if (!res.ok) throw new Error(`Indexer error: ${res.status}`);
      return await res.json();
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError ?? new Error("No indexer URLs provided");
}
async function fetchEnsFromChain(identifier, client, keys = []) {
  const isAddr = isAddress(identifier);
  let address;
  let ens;
  if (isAddr) {
    address = identifier;
    ens = await client.getEnsName({ address: identifier }) ?? null;
  } else {
    ens = identifier;
    const resolved = await client.getEnsAddress({ name: normalize(identifier) });
    if (!resolved) return { address: "", ens, data: null };
    address = resolved;
  }
  if (!ens || !keys.length) return { address, ens: ens ?? null, data: null };
  const name = normalize(ens);
  const results = await Promise.all(
    keys.map((key) => client.getEnsText({ name, key }).catch(() => null))
  );
  return {
    address,
    ens,
    data: toProfileData(
      keys,
      results.map((r) => r || "")
    )
  };
}
function toProfileData(keys, results) {
  const get = (key) => results[keys.indexOf(key)] || "";
  return {
    avatar: get("avatar"),
    header: get("header"),
    description: get("description"),
    links: {
      url: get("url"),
      email: get("email"),
      twitter: get("com.twitter"),
      github: get("com.github")
    }
  };
}
async function resolve(identifier, strategies, indexers, wagmi, chainKeys) {
  for (const strategy of strategies) {
    try {
      if (strategy === "indexer") {
        if (!indexers.length) continue;
        return await fetchEnsFromIndexer(identifier, indexers);
      }
      if (strategy === "chain") {
        const client = getPublicClient(wagmi, { chainId: 1 });
        if (!client) continue;
        return await fetchEnsFromChain(identifier, client, chainKeys);
      }
    } catch {
      continue;
    }
  }
  return { address: identifier, ens: null, data: null };
}
function useEnsBase(tier, identifier, chainKeys, options = {}) {
  const config = useConfig();
  const evmConfig = useEvmConfig();
  const mode = vueExports.computed(
    () => vueExports.toValue(options.mode) || evmConfig.ens?.mode || "indexer"
  );
  const indexers = vueExports.computed(() => evmConfig.ens?.indexers || []);
  const cacheKey = vueExports.computed(() => `ens-${tier}-${vueExports.toValue(identifier)}`);
  const data = vueExports.ref(
    ensCache.get(cacheKey.value) ?? void 0
  );
  const pending = vueExports.ref(false);
  vueExports.watchEffect(async () => {
    const id = vueExports.toValue(identifier);
    if (!id) {
      data.value = null;
      pending.value = false;
      return;
    }
    const cached = ensCache.get(cacheKey.value);
    if (cached) {
      data.value = cached;
      pending.value = false;
      return;
    }
    const strategies = mode.value === "indexer" ? ["indexer", "chain"] : ["chain", "indexer"];
    pending.value = true;
    try {
      data.value = await ensCache.fetch(
        cacheKey.value,
        () => resolve(id, strategies, indexers.value, config, chainKeys)
      );
    } catch {
      data.value = null;
    } finally {
      pending.value = false;
    }
  });
  return { data, pending };
}
const useEnsWithAvatar = (identifier, options) => useEnsBase("avatar", identifier, [...ENS_KEYS_AVATAR], options);
function useOwnedPunks(address) {
  const config = useRuntimeConfig();
  const indexerUrl = config.public.indexerUrl || "";
  const ids = vueExports.ref([]);
  const loading = vueExports.ref(false);
  const error = vueExports.ref(null);
  async function load() {
    const addr = vueExports.toValue(address);
    if (!addr) {
      ids.value = [];
      return;
    }
    loading.value = true;
    error.value = null;
    if (!indexerUrl) {
      error.value = "No indexer configured.";
      ids.value = [];
      loading.value = false;
      return;
    }
    try {
      const res = await fetch(indexerUrl.replace(/\/$/, "") + "/sql/punk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          where: { owner: addr.toLowerCase() },
          orderBy: { punk_id: "asc" },
          limit: 500
        })
      });
      if (!res.ok) throw new Error(`Indexer ${res.status}`);
      const data = await res.json();
      ids.value = data.map((row) => Number(row.punk_id));
    } catch (e) {
      error.value = e.message;
      ids.value = [];
    } finally {
      loading.value = false;
    }
  }
  vueExports.watchEffect(load);
  return { ids, loading, error, refresh: load };
}
const _sfc_main = /* @__PURE__ */ vueExports.defineComponent({
  __name: "[handle]",
  __ssrInlineRender: true,
  setup(__props) {
    const route = useRoute();
    const handle = vueExports.computed(() => String(route.params.handle));
    useHead(() => ({ title: `${handle.value} · punksmarket.xyz` }));
    const config = useConfig();
    const ensProfile = useEnsWithAvatar(handle);
    const resolving = vueExports.ref(true);
    const resolvedAddress = vueExports.ref(null);
    vueExports.watchEffect(async () => {
      resolving.value = true;
      const h = handle.value;
      if (isAddress(h)) {
        resolvedAddress.value = h;
        resolving.value = false;
        return;
      }
      const client = getPublicClient(config);
      if (!client) {
        resolving.value = false;
        return;
      }
      try {
        const addr = await client.getEnsAddress({ name: h });
        resolvedAddress.value = addr;
      } catch {
        resolvedAddress.value = null;
      } finally {
        resolving.value = false;
      }
    });
    const shortAddr = vueExports.computed(
      () => resolvedAddress.value ? shortAddress(resolvedAddress.value) : handle.value
    );
    usePunksMarketBids({ bidder: () => resolvedAddress.value ?? void 0 });
    useActivityFeed({ bidder: () => resolvedAddress.value ?? void 0 });
    useOwnedPunks(
      () => resolvedAddress.value ?? void 0
    );
    return (_ctx, _push, _parent, _attrs) => {
      const _component_ClientOnly = __nuxt_component_0;
      _push(`<div${serverRenderer_cjs_prodExports.ssrRenderAttrs(vueExports.mergeProps({ class: "container profile-page" }, _attrs))} data-v-902df66e><header class="profile-head" data-v-902df66e>`);
      if (vueExports.unref(ensProfile).data.value?.ens) {
        _push(`<h1 class="profile-name" data-v-902df66e>${serverRenderer_cjs_prodExports.ssrInterpolate(vueExports.unref(ensProfile).data.value.ens)}</h1>`);
      } else {
        _push(`<h1 class="profile-name muted" data-v-902df66e>${serverRenderer_cjs_prodExports.ssrInterpolate(vueExports.unref(shortAddr))}</h1>`);
      }
      _push(serverRenderer_cjs_prodExports.ssrRenderComponent(_component_ClientOnly, null, {}, _parent));
      _push(`</header>`);
      _push(serverRenderer_cjs_prodExports.ssrRenderComponent(_component_ClientOnly, null, {}, _parent));
      _push(`</div>`);
    };
  }
});
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = vueExports.useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("pages/profile/[handle].vue");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const _handle_ = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-902df66e"]]);

export { _handle_ as default };
//# sourceMappingURL=_handle_-CXSTggHi.mjs.map
