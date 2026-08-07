<script setup lang="ts">
definePageMeta({
  title: 'Convert',
})

import { buildClashConfig, buildClashProviderConfig } from '~/utils/proxy'

const rawProxies = ref('')
const convertedProxies = ref('')
const convertFormats = ref(['clash', 'provider'])
const isLoading = ref(false)
const activeFormat = ref('clash')
const isNoticeOpen = ref(false)
const noticeText = ref('')
const noticeTone = ref<'success' | 'error'>('success')
const errorMessage = ref('')

let noticeTimer: ReturnType<typeof setTimeout> | undefined

function showNotice(text: string, tone: 'success' | 'error') {
  noticeText.value = text
  noticeTone.value = tone
  isNoticeOpen.value = true

  if (noticeTimer) clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => {
    isNoticeOpen.value = false
  }, 2200)
}

async function convertProxiesTo(format: string) {
  if (!rawProxies.value.trim()) {
    showNotice('Please enter proxy URLs first', 'error')
    return
  }

  isLoading.value = true
  activeFormat.value = format
  errorMessage.value = ''
  try {
    const serialized = rawProxies.value.split('\n').join(',')
    if (format === 'provider') {
      convertedProxies.value = buildClashProviderConfig(serialized)
    } else {
      convertedProxies.value = buildClashConfig(serialized)
    }
  } catch (e: Error) {
    errorMessage.value = e.message
    showNotice('Conversion failed', 'error')
  } finally {
    isLoading.value = false
  }
}

async function copyToClipboard() {
  if (!convertedProxies.value.trim()) {
    showNotice('No result to copy', 'error')
    return
  }

  try {
    await navigator.clipboard.writeText(convertedProxies.value)
    showNotice('Copied to clipboard', 'success')
  } catch {
    showNotice('Copy failed', 'error')
  }
}

onBeforeUnmount(() => {
  if (noticeTimer) clearTimeout(noticeTimer)
})
</script>

<template>
  <section class="tool-shell">
    <div class="head-row">
      <h1 class="view-title">
        <span class="view-icon"><Icon name="uil:sync" size="14" aria-hidden="true" /></span>
        <span>Convert</span>
      </h1>
    </div>

    <div class="workspace-card">
      <section class="editor-panel">
        <p class="panel-label"><Icon name="uil:link-alt" size="13" aria-hidden="true" /> Raw URL</p>
        <textarea
          v-model="rawProxies"
          class="surface"
          placeholder="vless://..."
          aria-label="Enter proxy URLs to convert"
        ></textarea>
      </section>

      <div class="control-stack" role="group" aria-label="Conversion options">
        <button
          v-for="format in convertFormats"
          :key="format"
          class="format-pill"
          :class="[`format-${format}`, activeFormat === format ? 'active' : '']"
          :disabled="isLoading"
          :aria-busy="isLoading && activeFormat === format"
          @click="convertProxiesTo(format)"
        >
          <Icon
            :name="format === 'clash' ? 'uil:rocket' : 'uil:server-network'"
            size="13"
            aria-hidden="true"
          />
          {{ isLoading && activeFormat === format ? 'Running...' : format.toUpperCase() }}
        </button>

        <button
          class="format-pill format-copy"
          @click="copyToClipboard"
          aria-label="Copy converted result"
        >
          <Icon name="uil:copy" size="13" aria-hidden="true" /> Copy
        </button>
      </div>

      <section class="editor-panel">
        <p class="panel-label"><Icon name="uil:file-alt" size="13" aria-hidden="true" /> Result</p>
        <textarea
          :value="convertedProxies || errorMessage"
          class="surface"
          :placeholder="errorMessage || 'result...'"
          readonly
          aria-label="Converted result"
          :aria-invalid="!!errorMessage"
        ></textarea>
      </section>
    </div>

    <div
      v-if="isNoticeOpen"
      class="copy-notice"
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
.tool-shell {
  display: grid;
  grid-template-rows: auto auto;
  align-content: start;
  gap: 1rem;
  height: 100%;
  overflow: hidden;
  padding-top: 0.7rem;
  animation: reveal 0.45s ease both;
}

.head-row {
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

.workspace-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  gap: 0.55rem;
  border: 1px solid var(--line);
  border-radius: 1rem;
  background: rgba(16, 21, 36, 0.82);
  padding: 0.72rem;
  height: clamp(420px, 68vh, 620px);
  overflow: hidden;
}

.editor-panel {
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 0.45rem;
}

.panel-label {
  margin: 0;
  color: var(--text-soft);
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
}

.surface {
  min-height: 0;
  height: 100%;
  width: 100%;
  border: 1px solid var(--line);
  border-radius: 0.75rem;
  background: rgba(9, 11, 18, 0.88);
  color: var(--text-main);
  padding: 0.65rem;
  resize: none;
}

.control-stack {
  width: 132px;
  min-width: 132px;
  display: grid;
  align-content: center;
  gap: 0.38rem;
}

.format-pill {
  border: 1px solid rgba(148, 163, 184, 0.38);
  border-radius: 0.68rem;
  background: rgba(9, 11, 18, 0.58);
  color: var(--text-main);
  padding: 0.42rem 0.56rem;
  font-size: 0.72rem;
  display: inline-flex;
  justify-content: center;
  align-items: center;
  gap: 0.2rem;
  cursor: pointer;
  transition: 0.2s ease;
}

.format-clash {
  border-color: rgba(79, 140, 255, 0.55);
}

.format-provider {
  border-color: rgba(69, 225, 172, 0.55);
}

.format-copy {
  border-color: rgba(255, 186, 107, 0.56);
}

.format-pill:hover {
  transform: translateY(-1px);
}

.format-pill.active {
  box-shadow: inset 0 0 0 1px rgba(214, 228, 255, 0.18);
}

.format-pill:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.copy-notice {
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

.copy-notice.is-success {
  border: 1px solid rgba(96, 235, 190, 0.45);
  background: rgba(20, 58, 49, 0.92);
  color: #bcefe2;
}

.copy-notice.is-error {
  border: 1px solid rgba(255, 127, 157, 0.45);
  background: rgba(70, 23, 36, 0.92);
  color: #ffd1dc;
}

@media (max-width: 980px) {
  .workspace-card {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(0, 1fr) auto minmax(0, 1fr);
    height: clamp(500px, 72vh, 720px);
  }

  .control-stack {
    width: 100%;
    min-width: 0;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    align-content: stretch;
  }
}

@media (max-width: 760px) {
  .workspace-card {
    padding: 0.62rem;
  }

  .surface {
    min-height: clamp(110px, 20vh, 170px);
    font-size: 0.83rem;
  }
}
</style>
