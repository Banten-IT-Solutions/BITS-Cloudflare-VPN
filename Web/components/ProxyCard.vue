<script setup lang="ts">
const config = useRuntimeConfig()
const selectedProxies = useSelectedProxiesStore()
const props = defineProps({
  isp: String,
  ipPort: String,
  country: String,
})

const stats = reactive({
  proxyip: false,
  delay: 0,
  loading: false,
})
const isSelected = ref(false)
const delayLabel = computed(() => {
  if (stats.loading) return 'Checking'
  return stats.delay ? `${stats.delay} ms` : 'Timeout'
})

type ProxyCheckResponse = {
  proxyip: boolean
  delay?: number
}

async function checkProxyHealth() {
  stats.loading = true
  try {
    const res = await $fetch<ProxyCheckResponse>(
      `${config.public.apiBase}/api/v1/check?ip=${props.ipPort}`
    )
    stats.proxyip = res.proxyip
    stats.delay = res.delay || 0
  } catch {
    stats.proxyip = false
    stats.delay = 0
  }
  stats.loading = false
}

function selectProxy() {
  selectedProxies.toggleSelectedProxies(props.ipPort as string)
  toggleIsSelected()
}

function toggleIsSelected() {
  isSelected.value = selectedProxies.getSelectedProxies.includes(props.ipPort as string)
}

onMounted(() => {
  toggleIsSelected()
})

watch(props, () => {
  stats.proxyip = false
  stats.delay = 0
  stats.loading = false
  toggleIsSelected()
})

watch(selectedProxies.getSelectedProxies, () => {
  toggleIsSelected()
})
</script>

<template>
  <article class="proxy-card" :class="isSelected ? 'selected' : ''">
    <button class="proxy-main" type="button" @click="selectProxy">
      <span class="select-mark" :class="isSelected ? 'on' : ''">
        <Icon :name="isSelected ? 'uil:check' : 'uil:plus'" size="12" />
      </span>

      <img
        class="flag"
        :src="`${config.public.flagCdn}/${props.country}.svg`"
        :alt="`Flag of ${props.country}`"
        loading="lazy"
      />

      <span class="info-chip isp-chip">
        <strong>{{ props.isp }}</strong>
      </span>

      <span class="info-chip endpoint-chip">
        <Icon name="uil:server-network" size="12" />
        <span>{{ props.ipPort }}</span>
      </span>

      <span class="info-chip latency-chip" :class="stats.proxyip ? 'ok' : 'bad'">
        <span v-if="stats.loading" class="spinner" aria-hidden="true"></span>
        <Icon v-else :name="stats.proxyip ? 'uil:signal-alt-3' : 'uil:times-circle'" size="12" />
        <span>{{ delayLabel }}</span>
      </span>
    </button>

    <button class="probe-btn" type="button" :disabled="stats.loading" @click="checkProxyHealth()">
      <Icon
        :name="stats.loading ? 'uil:spinner-alt' : 'uil:sync'"
        size="13"
        :class="stats.loading ? 'spin' : ''"
      />
    </button>
  </article>
</template>

<style scoped>
.proxy-card {
  width: 100%;
  border-radius: 0.82rem;
  border: 1px solid rgba(120, 154, 210, 0.24);
  background: linear-gradient(145deg, rgba(16, 21, 36, 0.84), rgba(9, 13, 24, 0.92));
  padding: 0.42rem;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.38rem;
  transition:
    transform 0.2s ease,
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

.proxy-card:hover {
  transform: translateY(-1px);
  border-color: rgba(122, 162, 255, 0.5);
  box-shadow: 0 10px 24px rgba(3, 8, 18, 0.3);
}

.proxy-card.selected {
  border-color: rgba(79, 140, 255, 0.85);
  box-shadow:
    inset 0 0 0 1px rgba(79, 140, 255, 0.45),
    0 10px 28px rgba(13, 36, 80, 0.26);
}

.proxy-main {
  width: 100%;
  display: flex;
  gap: 0.34rem;
  align-items: center;
  text-align: left;
  min-width: 0;
}

.select-mark {
  width: 1.28rem;
  height: 1.28rem;
  border-radius: 0.38rem;
  border: 1px solid rgba(148, 163, 184, 0.34);
  background: rgba(9, 12, 21, 0.88);
  color: #a8bbde;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  transition: 0.2s ease;
}

.select-mark.on {
  border-color: rgba(79, 140, 255, 0.78);
  background: rgba(79, 140, 255, 0.2);
  color: #dbeaff;
  box-shadow: 0 0 14px rgba(79, 140, 255, 0.24);
}

.flag {
  width: 1.38rem;
  height: 1.38rem;
  border-radius: 9999px;
  border: 1px solid rgba(148, 163, 184, 0.42);
  flex: 0 0 auto;
}

.info-chip {
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 0.5rem;
  background: rgba(9, 12, 21, 0.7);
  height: 1.5rem;
  padding: 0 0.42rem;
  display: inline-flex;
  align-items: center;
  gap: 0.24rem;
  min-width: 0;
  color: var(--text-soft);
  font-size: 0.72rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.isp-chip {
  flex: 1 1 34%;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  padding: 0 0.08rem;
}

.isp-chip strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text-main);
  font-size: 0.74rem;
}

.endpoint-chip {
  flex: 0 0 auto;
  width: fit-content;
  max-width: 100%;
  border: 1px solid rgba(79, 140, 255, 0.48);
  border-radius: 0.5rem;
  background: rgba(20, 35, 64, 0.36);
  color: #cfe0ff;
  margin-left: auto;
  justify-content: flex-end;
  text-align: right;
}

.endpoint-chip span,
.latency-chip span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.endpoint-chip span {
  text-align: right;
}

.latency-chip {
  flex: 0 0 auto;
  border-color: rgba(148, 163, 184, 0.28);
  color: #d0d9eb;
}

.latency-chip.ok {
  border-color: rgba(89, 228, 190, 0.45);
  color: #b9f0e2;
  box-shadow: inset 0 0 0 1px rgba(89, 228, 190, 0.16);
}

.latency-chip.bad {
  border-color: rgba(255, 127, 157, 0.4);
  color: #ffc8d6;
}

.probe-btn {
  width: 1.95rem;
  height: 1.95rem;
  border-radius: 0.56rem;
  border: 1px solid rgba(120, 154, 210, 0.3);
  background: rgba(9, 12, 21, 0.84);
  color: #b5caee;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: 0.2s ease;
}

.probe-btn:hover:not(:disabled) {
  border-color: rgba(79, 140, 255, 0.68);
  color: #d8e8ff;
}

.probe-btn:disabled {
  opacity: 0.55;
  cursor: wait;
}

.spinner {
  width: 0.74rem;
  height: 0.74rem;
  border-radius: 9999px;
  border: 2px solid rgba(148, 163, 184, 0.34);
  border-top-color: rgba(214, 228, 255, 0.92);
  animation: spin 0.75s linear infinite;
}

.spin {
  animation: spin 0.75s linear infinite;
}

@media (max-width: 760px) {
  .proxy-card {
    grid-template-columns: 1fr;
  }

  .proxy-main {
    flex-wrap: wrap;
  }

  .probe-btn {
    width: 100%;
  }

  .isp-chip,
  .latency-chip {
    flex: 1 1 calc(50% - 0.2rem);
  }

  .endpoint-chip {
    flex: 0 0 auto;
    margin-left: auto;
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
