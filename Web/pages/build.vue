<script setup lang="ts">
definePageMeta({
  title: 'Build',
})

const config = useRuntimeConfig()
const route = useRoute()
const selectedProxies = useSelectedProxiesStore()

const myip = reactive({
  asOrganization: 'Unavailable',
  ip: 'Unavailable',
  city: '',
  region: '',
  country: '',
})

type ProxyItem = {
  ip: string
  isp: string
  port: string
  country: string
}

const proxies = ref<ProxyItem[]>([])
const countries = ref<string[]>([])
const selectedCountry = ref('All')
const isCountryMenuOpen = ref(false)
const displayProxies = ref<ProxyItem[]>([])
const page = ref(1)
const itemPerPage = ref(10)
const pagination = ref([1])
const totalPages = ref(1)
const displaySelected = ref(false)
const isNoticeOpen = ref(false)
const noticeText = ref('')
const noticeTone = ref<'success' | 'error'>('success')
const search = ref('')
const settingsDialogRef = ref<HTMLDialogElement | null>(null)
const isLoading = ref(true)
const loadError = ref('')

function openSettingsDialog() {
  settingsDialogRef.value?.showModal()
}

const proxySettings = reactive<ProxySettings>({
  protocol: 'vless',
  format: 'raw',
  tls: true,
  host: route.query.host?.toString() || 'vpn.bits.co.id',
  server: 'support.zoom.us',
  wildcard: false,
})

const activeHost = computed(() =>
  proxySettings.wildcard ? `${proxySettings.server}.${proxySettings.host}` : proxySettings.host
)
const exportFormatLabel = 'Link'

const countryLabel = computed(() => myip.country?.trim() || 'Country unavailable')
const cityLabel = computed(() => myip.city?.trim() || 'City unavailable')
const countryMenuRef = ref<HTMLElement | null>(null)

function closeAllMenus() {
  isCountryMenuOpen.value = false
}

function toggleCountryMenu() {
  const next = !isCountryMenuOpen.value
  closeAllMenus()
  isCountryMenuOpen.value = next
}

function selectCountry(country: string) {
  selectedCountry.value = country
  isCountryMenuOpen.value = false
}

function closeMenusOnOutsideClick(event: PointerEvent) {
  const target = event.target as Node

  if (countryMenuRef.value && !countryMenuRef.value.contains(target)) {
    isCountryMenuOpen.value = false
  }
}

function closeMenusOnEscape(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    closeAllMenus()
  }
}

type MyIpResponse = {
  ip?: string
  query?: string
  city?: string
  region?: string
  regionName?: string
  country?: string
  countryCode?: string
  org?: string
  organization?: string
  asOrganization?: string
  connection?: { isp?: string }
}

function applyMyIp(data: MyIpResponse) {
  myip.asOrganization =
    data?.asOrganization ||
    data?.org ||
    data?.organization ||
    data?.connection?.isp ||
    'Unavailable'
  myip.ip = data?.ip || data?.query || 'Unavailable'
  myip.city = data?.city || ''
  myip.region = data?.region || data?.regionName || ''
  myip.country = data?.country || data?.countryCode || ''
}

function normalizeMyIpPayload(payload: unknown): MyIpResponse {
  if (typeof payload === 'object' && payload !== null) return payload as MyIpResponse
  if (typeof payload === 'string') {
    try {
      return JSON.parse(payload)
    } catch {
      return {}
    }
  }
  return {}
}

function applyUnavailableMyIp() {
  myip.asOrganization = 'Unavailable'
  myip.ip = 'Unavailable'
  myip.city = ''
  myip.region = ''
  myip.country = ''
}

async function loadMyIp() {
  try {
    const primaryRaw = await $fetch(`${config.public.apiBase}/api/v1/myip`, { cache: 'no-cache' })
    const primary = normalizeMyIpPayload(primaryRaw)

    if (primary?.ip || primary?.query) {
      applyMyIp(primary)
      return
    }
  } catch {}

  applyUnavailableMyIp()
}

function getTempProxies() {
  let proxiesTemp = proxies.value

  if (displaySelected.value) {
    proxiesTemp = proxiesTemp.filter(proxy =>
      selectedProxies.getSelectedProxies.includes(`${proxy.ip}:${proxy.port}`)
    )
  }

  if (selectedCountry.value.length === 2) {
    proxiesTemp = proxiesTemp.filter(
      proxy => proxy.country.toString() === selectedCountry.value.toLowerCase()
    )
  }

  if (search.value) {
    proxiesTemp = proxiesTemp.filter(proxy =>
      proxy.isp.toString().toLowerCase().includes(search.value.toLowerCase())
    )
  }

  return proxiesTemp
}

async function copyToClipboard() {
  try {
    const selectedProxyItems = proxies.value.filter(proxy =>
      selectedProxies.getSelectedProxies.includes(`${proxy.ip}:${proxy.port}`)
    )
    const configResult = await parseProxies(selectedProxyItems, proxySettings)
    await navigator.clipboard.writeText(configResult)
    noticeText.value = 'VLESS link copied to clipboard!'
    noticeTone.value = 'success'
    isNoticeOpen.value = true
  } catch {
    noticeText.value = 'Failed to copy VLESS link.'
    noticeTone.value = 'error'
    isNoticeOpen.value = true
  }
}

watch([selectedCountry, displaySelected, search], () => {
  page.value = 1
})

watch([page, proxies, selectedCountry, displaySelected, search], () => {
  setPagination()
  setDisplayProxies()
})

watch([isNoticeOpen], () => {
  if (!isNoticeOpen.value) return

  setTimeout(() => {
    isNoticeOpen.value = false
  }, 2600)
})

if (import.meta.client) {
  loadMyIp()
}

onMounted(() => {
  if (!import.meta.client) return
  document.addEventListener('pointerdown', closeMenusOnOutsideClick)
  document.addEventListener('keydown', closeMenusOnEscape)
})

onBeforeUnmount(() => {
  if (!import.meta.client) return
  document.removeEventListener('pointerdown', closeMenusOnOutsideClick)
  document.removeEventListener('keydown', closeMenusOnEscape)
})

const { data: proxyData, error } = await useFetch<string>(config.public.githubProxyUrl)

if (error.value) {
  loadError.value = 'Failed to load proxy list'
  isLoading.value = false
} else if (proxyData.value) {
  const proxiesTemp: ProxyItem[] = []
  const countriesTemp: string[] = []

  for (const data of proxyData.value.split('\n')) {
    const [ip, port, country, isp] = data.split(',')
    if (!ip || !port || !country || !isp) continue
    proxiesTemp.push({ ip, port, country: country.toLowerCase(), isp })
    countriesTemp.push(country)
  }

  proxies.value = proxiesTemp
  countries.value = ['All', ...new Set(countriesTemp)]
  isLoading.value = false
}

function setDisplayProxies() {
  const proxiesTemp = getTempProxies()
  const startIndex = (page.value - 1) * itemPerPage.value
  const endIndex = startIndex + itemPerPage.value
  displayProxies.value = proxiesTemp.slice(startIndex, endIndex)
}

function setPagination() {
  const proxiesTemp = getTempProxies()
  const maxPage = Math.max(1, Math.ceil(proxiesTemp.length / itemPerPage.value))
  const maxItem = 5
  const paginationTemp: number[] = []

  totalPages.value = maxPage

  if (page.value < 1) page.value = 1
  if (page.value > maxPage) page.value = maxPage

  const startPage =
    page.value <= 3 ? 1 : page.value + 2 >= maxPage ? Math.max(1, maxPage - 4) : page.value - 2

  for (let i = startPage; i <= maxPage; i++) {
    paginationTemp.push(i)
    if (paginationTemp.length >= maxItem) break
  }

  pagination.value = paginationTemp
}

function goToPage(targetPage: number) {
  if (targetPage < 1) {
    page.value = 1
    return
  }

  if (targetPage > totalPages.value) {
    page.value = totalPages.value
    return
  }

  page.value = targetPage
}

function goToFirstPage() {
  goToPage(1)
}

function goToPreviousPage() {
  goToPage(page.value - 1)
}

function goToNextPage() {
  goToPage(page.value + 1)
}

function goToLastPage() {
  goToPage(totalPages.value)
}
</script>

<template>
  <dialog ref="settingsDialogRef" class="settings-dialog">
    <div class="settings-card">
      <div class="settings-head">
        <h3>Profile Settings</h3>
        <p>Tune server profile before export.</p>
      </div>

      <div class="settings-layout">
        <div class="field-grid">
          <label class="field">
            <span>Server</span>
            <div class="field-shell">
              <Icon name="uil:server-network" size="13" />
              <input v-model="proxySettings.server" type="text" placeholder="support.zoom.us" />
            </div>
          </label>

          <label class="field">
            <span>Host</span>
            <div class="field-shell">
              <Icon name="uil:link-h" size="13" />
              <input v-model="proxySettings.host" type="text" placeholder="vpn.bits.co.id" />
            </div>
          </label>

          <div class="field">
            <span>Protocol</span>
            <div class="field-shell static-field">
              <Icon name="uil:shield" size="13" />
              <span class="static-value">{{ proxySettings.protocol.toUpperCase() }}</span>
            </div>
          </div>

          <div class="field">
            <span>Format</span>
            <div class="field-shell static-field">
              <Icon name="uil:link" size="13" />
              <span class="static-value">{{ exportFormatLabel }}</span>
            </div>
          </div>
        </div>

        <div class="switch-grid">
          <div class="switch-field">
            <span>TLS</span>
            <div class="toggle-row">
              <span class="toggle-label"><Icon name="uil:shield-check" size="13" /> Enabled</span>
              <button
                type="button"
                class="toggle-switch"
                :class="proxySettings.tls ? 'is-on' : ''"
                :aria-pressed="proxySettings.tls"
                @click="proxySettings.tls = !proxySettings.tls"
              >
                <span class="toggle-knob"></span>
              </button>
            </div>
          </div>

          <div class="switch-field">
            <span>Wildcard</span>
            <div class="toggle-row">
              <span class="toggle-label"><Icon name="uil:asterisk" size="13" /> Enabled</span>
              <button
                type="button"
                class="toggle-switch"
                :class="proxySettings.wildcard ? 'is-on' : ''"
                :aria-pressed="proxySettings.wildcard"
                @click="proxySettings.wildcard = !proxySettings.wildcard"
              >
                <span class="toggle-knob"></span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="preview">
        Effective host: <strong>{{ activeHost }}</strong>
      </div>

      <div class="settings-actions">
        <form method="dialog">
          <button class="panel-button">Done</button>
        </form>
      </div>
    </div>
  </dialog>

  <section class="vpn-shell">
    <div class="header-row">
      <h1 class="view-title">
        <span class="view-icon"><Icon name="uil:wrench" size="14" /></span>
        <span>Build</span>
      </h1>

      <div class="head-pills">
        <span class="head-pill data-pill">
          <Icon name="uil:building" size="13" />
          <span class="pill-text">{{ myip.asOrganization }}</span>
        </span>
        <span class="head-pill data-pill">
          <Icon name="uil:wifi" size="13" />
          <span class="pill-text">{{ myip.ip }}</span>
        </span>
        <span class="head-pill data-pill">
          <Icon name="uil:globe" size="13" />
          <span class="pill-text">{{ countryLabel }} - {{ cityLabel }}</span>
        </span>
      </div>
    </div>

    <div class="control-ribbon">
      <label class="ribbon-input" aria-label="Search provider">
        <Icon name="uil:search" size="14" />
        <input
          v-model="search"
          type="text"
          placeholder="Search provider"
          class="input-surface"
          aria-label="Search by provider name"
        />
      </label>

      <div
        ref="countryMenuRef"
        class="ribbon-select"
        :class="isCountryMenuOpen ? 'is-open' : ''"
        role="combobox"
        aria-label="Filter by country"
      >
        <Icon name="uil:globe" size="14" aria-hidden="true" />
        <button
          type="button"
          class="select-surface"
          :aria-expanded="isCountryMenuOpen"
          aria-haspopup="listbox"
          aria-label="Select country"
          @click="toggleCountryMenu"
        >
          <span class="select-text">{{ selectedCountry }}</span>
          <span class="select-caret"
            ><Icon name="uil:angle-down" size="13" aria-hidden="true"
          /></span>
        </button>
        <div
          v-if="isCountryMenuOpen"
          class="select-menu"
          role="listbox"
          aria-label="Country options"
        >
          <button
            v-for="country in countries"
            :key="country"
            type="button"
            class="select-option"
            :class="country === selectedCountry ? 'active' : ''"
            role="option"
            :aria-selected="country === selectedCountry"
            @click="selectCountry(country)"
          >
            {{ country }}
          </button>
        </div>
      </div>

      <button
        class="panel-button ghost"
        @click="displaySelected = !displaySelected"
        :aria-pressed="displaySelected"
        aria-label="Toggle showing selected proxies only"
      >
        <Icon name="uil:list-ul" size="14" aria-hidden="true" />
        {{ displaySelected ? 'Show All' : 'Only Selected' }}
      </button>

      <button class="panel-button" @click="openSettingsDialog" aria-label="Open settings">
        <Icon name="uil:sliders-v-alt" size="14" aria-hidden="true" /> Settings
      </button>
      <button
        class="panel-button export"
        @click="copyToClipboard"
        aria-label="Copy selected VLESS links"
      >
        <Icon name="uil:link" size="14" aria-hidden="true" /> Copy Link
      </button>
    </div>

    <div class="proxy-grid-wrap">
      <div class="proxy-grid">
        <ProxyCard
          v-for="proxy in displayProxies"
          :key="`${proxy.ip}:${proxy.port}`"
          :isp="proxy.isp"
          :ip-port="`${proxy.ip}:${proxy.port}`"
          :country="proxy.country"
        />
      </div>

      <div class="pager">
        <button class="pager-control pager-nav" :disabled="page === 1" @click="goToFirstPage">
          First
        </button>
        <button class="pager-control pager-nav" :disabled="page === 1" @click="goToPreviousPage">
          <Icon name="uil:angle-left" size="13" /> Prev
        </button>
        <button
          v-for="pageIndex in pagination"
          :key="pageIndex"
          class="pager-control"
          :class="pageIndex == page ? 'active' : ''"
          @click="goToPage(pageIndex)"
        >
          {{ pageIndex }}
        </button>
        <button
          class="pager-control pager-nav"
          :disabled="page === totalPages"
          @click="goToNextPage"
        >
          Next <Icon name="uil:angle-right" size="13" />
        </button>
        <button
          class="pager-control pager-nav"
          :disabled="page === totalPages"
          @click="goToLastPage"
        >
          Last
        </button>
      </div>
    </div>

    <div
      v-if="isNoticeOpen"
      class="notice-chip"
      :class="noticeTone === 'error' ? 'is-error' : 'is-success'"
    >
      <Icon
        :name="noticeTone === 'error' ? 'uil:exclamation-circle' : 'uil:check-circle'"
        size="15"
      />
      {{ noticeText }}
    </div>
  </section>
</template>

<style scoped>
.vpn-shell {
  display: grid;
  gap: 0.82rem;
  animation: reveal 0.45s ease both;
}

.header-row {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 0.3rem 0 0.5rem;
  gap: 0.6rem;
}

.view-title {
  margin: 0;
  display: inline-flex;
  align-items: center;
  gap: 0.42rem;
  font-family: 'Space Grotesk', sans-serif;
  font-size: clamp(1.15rem, 2.3vw, 1.45rem);
  letter-spacing: 0.01em;
}

.view-icon {
  width: 1.58rem;
  height: 1.58rem;
  border-radius: 0.5rem;
  border: 1px solid rgba(79, 140, 255, 0.42);
  background: linear-gradient(145deg, rgba(79, 140, 255, 0.3), rgba(79, 140, 255, 0.1));
  box-shadow: inset 0 0 0 1px rgba(79, 140, 255, 0.2);
  color: #cfe0ff;
  display: grid;
  place-items: center;
  animation: pulseIcon 2.8s ease-in-out infinite;
}

.head-pills {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 0.32rem;
}

.head-pill {
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 9999px;
  padding: 0.2rem 0.48rem;
  font-size: 0.72rem;
  color: var(--text-soft);
  background: rgba(12, 17, 31, 0.72);
  display: inline-flex;
  align-items: center;
  gap: 0.24rem;
  min-width: 0;
}

.head-pill.data-pill {
  max-width: min(36vw, 240px);
}

.pill-text {
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.control-ribbon {
  --control-height: 2.1rem;
  border: 1px solid var(--line);
  border-radius: 0.9rem;
  background: linear-gradient(145deg, rgba(16, 21, 36, 0.88), rgba(10, 14, 26, 0.94));
  padding: 0.62rem;
  display: grid;
  gap: 0.55rem;
  grid-template-columns: minmax(0, 1fr) minmax(180px, 0.75fr) auto auto auto;
  align-items: center;
}

.ribbon-input,
.ribbon-select {
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 0.72rem;
  background: rgba(9, 11, 18, 0.66);
  height: var(--control-height);
  padding: 0 0.52rem;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.ribbon-select {
  position: relative;
}

.proxy-grid-wrap {
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 0.92rem;
  background: rgba(11, 15, 27, 0.76);
  padding: 0.65rem;
}

.proxy-grid {
  display: grid;
  gap: 0.46rem;
  grid-template-columns: 1fr;
  align-content: start;
}

.input-surface,
.select-surface {
  width: 100%;
  height: 100%;
  flex: 1 1 auto;
  min-width: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--text-main);
  font-size: 0.78rem;
  line-height: 1;
  padding: 0;
  outline: none;
}

.select-surface {
  cursor: pointer;
  height: calc(100% - 0.52rem);
  border: 1px solid rgba(120, 154, 210, 0.34);
  border-radius: 0.58rem;
  background: linear-gradient(145deg, rgba(14, 20, 35, 0.9), rgba(10, 15, 28, 0.95));
  padding: 0 0.42rem;
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.34rem;
}

.select-caret {
  color: #9fb4db;
  pointer-events: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.ribbon-select.is-open .select-caret {
  transform: rotate(180deg);
}

.select-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
}

.select-menu {
  position: absolute;
  top: calc(100% + 0.38rem);
  left: 0;
  right: 0;
  z-index: 50;
  border: 1px solid rgba(120, 154, 210, 0.32);
  border-radius: 0.68rem;
  background: linear-gradient(155deg, rgba(14, 20, 35, 0.98), rgba(10, 15, 28, 0.98));
  box-shadow: 0 10px 30px rgba(3, 7, 18, 0.55);
  padding: 0.24rem;
  max-height: 220px;
  overflow: auto;
}

.select-option {
  width: 100%;
  border: 1px solid transparent;
  border-radius: 0.5rem;
  background: transparent;
  color: var(--text-main);
  font-size: 0.76rem;
  line-height: 1.2;
  text-align: left;
  padding: 0.42rem 0.5rem;
  transition: 0.16s ease;
}

.select-option:hover {
  border-color: rgba(120, 154, 210, 0.28);
  background: rgba(120, 154, 210, 0.12);
}

.select-option.active {
  border-color: rgba(120, 154, 210, 0.45);
  background: rgba(120, 154, 210, 0.18);
  color: #dce8ff;
}

.settings-card select option {
  background: #0d1422;
  color: #e5edff;
}

.input-surface:focus,
.input-surface:focus-visible {
  outline: none;
  box-shadow: none;
}

.select-surface:focus,
.select-surface:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px rgba(120, 154, 210, 0.22);
}

.settings-card input {
  width: 100%;
  border: 0;
  background: transparent;
  color: var(--text-main);
  padding: 0;
  font-size: 0.82rem;
  outline: none;
}

.field-shell,
.field-select,
.toggle-row {
  width: 100%;
  min-height: 2.2rem;
  border: 1px solid rgba(120, 154, 210, 0.32);
  border-radius: 0.7rem;
  background: linear-gradient(145deg, rgba(14, 20, 35, 0.94), rgba(10, 15, 28, 0.98));
  color: var(--text-main);
  padding: 0 0.56rem;
  display: inline-flex;
  align-items: center;
  gap: 0.34rem;
}

.field-shell :deep(svg),
.field-select :deep(svg),
.toggle-label :deep(svg) {
  color: #9fb4db;
}

.static-field {
  justify-content: flex-start;
}

.static-value {
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.04em;
}

.menu-field {
  position: relative;
}

.field-select {
  justify-content: space-between;
  font-size: 0.8rem;
}

.menu-field.is-open .select-caret {
  transform: rotate(180deg);
}

.settings-menu {
  top: calc(100% + 0.34rem);
}

.panel-button {
  border: 1px solid rgba(79, 140, 255, 0.44);
  border-radius: 0.7rem;
  background: rgba(10, 14, 26, 0.72);
  color: var(--text-main);
  height: var(--control-height, 2.1rem);
  padding: 0 0.66rem;
  font-size: 0.78rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.24rem;
  transition: 0.2s ease;
}

.panel-button:hover {
  border-color: rgba(79, 140, 255, 0.82);
  transform: translateY(-1px);
}

.panel-button.ghost {
  border-color: rgba(148, 163, 184, 0.35);
}

.panel-button.export {
  border-color: rgba(255, 183, 92, 0.54);
}

.pager {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 0.36rem;
  flex-wrap: wrap;
  margin-top: 0.58rem;
  border: 1px solid rgba(120, 154, 210, 0.24);
  border-radius: 0.92rem;
  background: linear-gradient(145deg, rgba(16, 21, 36, 0.76), rgba(9, 13, 24, 0.86));
  padding: 0.44rem;
}

.pager-control {
  min-width: 2.08rem;
  height: 2.04rem;
  border: 1px solid rgba(120, 154, 210, 0.28);
  border-radius: 0.66rem;
  background: rgba(9, 12, 21, 0.8);
  color: var(--text-main);
  padding: 0 0.58rem;
  font-size: 0.78rem;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.2rem;
  transition: 0.2s ease;
}

.pager-control:hover:not(:disabled) {
  border-color: rgba(79, 140, 255, 0.62);
  transform: translateY(-1px);
}

.pager-nav {
  min-width: 4.35rem;
}

.pager-control.active {
  border-color: rgba(79, 140, 255, 0.88);
  background: linear-gradient(155deg, rgba(62, 122, 242, 0.3), rgba(79, 140, 255, 0.16));
  box-shadow: inset 0 0 0 1px rgba(157, 198, 255, 0.18);
  color: #d8e8ff;
}

.pager-control:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  transform: none;
}

.notice-chip {
  position: fixed;
  right: 1rem;
  top: 1rem;
  border-radius: 0.62rem;
  padding: 0.36rem 0.58rem;
  font-size: 0.74rem;
  display: inline-flex;
  align-items: center;
  gap: 0.24rem;
  z-index: 80;
}

.notice-chip.is-success {
  border: 1px solid rgba(96, 235, 190, 0.45);
  background: rgba(20, 58, 49, 0.92);
  color: #bcefe2;
}

.notice-chip.is-error {
  border: 1px solid rgba(255, 127, 157, 0.45);
  background: rgba(70, 23, 36, 0.92);
  color: #ffd1dc;
}

@media (max-width: 1100px) {
  .control-ribbon {
    grid-template-columns: minmax(0, 1fr) minmax(180px, 1fr);
  }
}

@media (max-width: 760px) {
  .header-row {
    justify-content: center;
    flex-wrap: wrap;
  }

  .head-pills {
    width: 100%;
    justify-content: center;
  }

  .control-ribbon {
    grid-template-columns: 1fr;
  }
}

.settings-card {
  border: 1px solid rgba(120, 154, 210, 0.28);
  background:
    radial-gradient(circle at 12% 12%, rgba(79, 140, 255, 0.18), transparent 50%),
    linear-gradient(160deg, rgba(13, 18, 33, 0.98), rgba(9, 13, 25, 0.99));
  border-radius: 1rem;
  padding: 1rem;
  box-shadow: 0 16px 42px rgba(2, 6, 18, 0.56);
}

.settings-dialog {
  border: none;
  border-radius: 1rem;
  padding: 0;
  width: min(760px, 92vw);
  max-height: min(84vh, 760px);
  background: transparent;
}

.settings-dialog::backdrop {
  background: rgba(8, 11, 20, 0.72);
  backdrop-filter: blur(2px);
}

.settings-actions {
  margin-top: 0.9rem;
  display: flex;
  justify-content: flex-end;
}

.settings-head h3 {
  margin: 0;
  font-family: 'Space Grotesk', sans-serif;
  font-size: 1.06rem;
  color: var(--text-main);
}

.settings-head p {
  color: var(--text-soft);
  margin: 0.3rem 0 0.72rem;
  font-size: 0.8rem;
}

.settings-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(180px, 0.85fr);
  gap: 0.72rem;
}

.field-grid {
  display: grid;
  gap: 0.58rem;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.field {
  display: grid;
  gap: 0.28rem;
}

.field span {
  color: var(--text-soft);
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.07em;
}

.switch-grid {
  display: grid;
  align-content: start;
  gap: 0.5rem;
}

.switch-field {
  display: grid;
  gap: 0.28rem;
}

.switch-field > span {
  color: var(--text-soft);
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.07em;
}

.toggle-row {
  padding: 0 0.56rem;
  justify-content: space-between;
  gap: 0.5rem;
}

.toggle-label {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  color: var(--text-main);
  font-size: 0.77rem;
}

.toggle-switch {
  width: 2.35rem;
  height: 1.3rem;
  border: 1px solid rgba(120, 154, 210, 0.32);
  border-radius: 9999px;
  background: rgba(51, 65, 85, 0.42);
  padding: 0.12rem;
  display: inline-flex;
  align-items: center;
  transition: 0.22s ease;
}

.toggle-knob {
  width: 0.9rem;
  height: 0.9rem;
  border-radius: 9999px;
  background: #d7e6ff;
  box-shadow: 0 1px 7px rgba(3, 8, 18, 0.4);
  transition: 0.22s ease;
}

.toggle-switch.is-on {
  border-color: rgba(79, 140, 255, 0.62);
  background: rgba(79, 140, 255, 0.34);
}

.toggle-switch.is-on .toggle-knob {
  transform: translateX(1.02rem);
  background: #ffffff;
}

.preview {
  margin-top: 0.72rem;
  border: 1px solid rgba(120, 154, 210, 0.2);
  border-radius: 0.72rem;
  background: rgba(10, 14, 26, 0.7);
  padding: 0.45rem 0.58rem;
  font-size: 0.77rem;
  color: var(--text-soft);
}

.preview strong {
  color: var(--text-main);
}

@media (max-width: 760px) {
  .settings-layout {
    grid-template-columns: 1fr;
  }

  .field-grid {
    grid-template-columns: 1fr;
  }

  .settings-actions .panel-button {
    width: 100%;
  }
}
</style>
