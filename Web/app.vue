<script setup lang="ts">
const route = useRoute()
const appName = 'BITS VPN'
const error = ref<Error | null>(null)

function getNormalizedPath(path: string) {
  if (!path || path === '/') return '/'
  return path.replace(/\/+$/, '') || '/'
}

function isSinglePagePath(path: string) {
  const normalized = getNormalizedPath(path)
  return normalized === '/' || normalized === '/convert' || normalized === '/monitor'
}

onErrorCaptured((err: Error) => {
  error.value = err
  console.error('App error:', err.message)
  return false
})

function clearError() {
  error.value = null
}

useHead(() => {
  const pageTitle = typeof route.meta?.title === 'string' ? route.meta.title.trim() : ''
  const current = pageTitle || appName
  const title = current === appName ? appName : `${current} | ${appName}`
  const isSinglePage = isSinglePagePath(route.path)

  return {
    title,
    bodyAttrs: {
      class: isSinglePage ? 'single-page-body' : undefined,
    },
  }
})
</script>

<template>
  <div class="app-canvas">
    <NuxtRouteAnnouncer />
    <NuxtLayout>
      <div v-if="error" class="error-boundary">
        <div class="error-card">
          <Icon name="uil:exclamation-triangle" size="32" />
          <h2>Something went wrong</h2>
          <p>{{ error.message }}</p>
          <button @click="clearError">Try Again</button>
        </div>
      </div>
      <NuxtPage v-else />
    </NuxtLayout>
  </div>
</template>

<style>
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;700&family=Space+Grotesk:wght@500;700&display=swap');

:root {
  --bg-main: #05070d;
  --bg-soft: #0f1320;
  --text-main: #eef3ff;
  --text-soft: #9aabcf;
  --line: rgba(148, 163, 184, 0.2);
  --accent: #4f8cff;
  --accent-soft: rgba(79, 140, 255, 0.22);
}

html,
body,
#__nuxt {
  height: 100%;
}

body.single-page-body {
  overflow: hidden;
  position: fixed;
  inset: 0;
  width: 100%;
}

body.single-page-body #__nuxt,
body.single-page-body .app-canvas {
  height: 100dvh;
  min-height: 100dvh;
  overflow: hidden;
}

body {
  margin: 0;
  color: var(--text-main);
  background: var(--bg-main);
  font-family: 'Plus Jakarta Sans', sans-serif;
}

.app-canvas {
  position: relative;
  min-height: 100vh;
  isolation: isolate;
  overflow: hidden;
}

.app-canvas::before {
  content: '';
  position: fixed;
  left: 0;
  right: 0;
  bottom: -30vh;
  height: 40vh;
  pointer-events: none;
  z-index: -1;
  background: linear-gradient(45deg, #00dc82, #36e4da 50%, #0047e1);
  filter: blur(20vh);
  opacity: 0.95;
}

.error-boundary {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 1rem;
}

.error-card {
  display: grid;
  gap: 0.75rem;
  text-align: center;
  padding: 2rem;
  border-radius: 1rem;
  border: 1px solid rgba(255, 99, 132, 0.4);
  background: rgba(70, 23, 36, 0.92);
  color: #ffc9d2;
  max-width: 360px;
}

.error-card h2 {
  margin: 0;
  font-size: 1.25rem;
  color: #fff;
}

.error-card p {
  margin: 0;
  font-size: 0.875rem;
  color: #ffa3b3;
}

.error-card button {
  margin-top: 0.5rem;
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
  border: 1px solid rgba(255, 183, 107, 0.5);
  background: rgba(255, 183, 107, 0.15);
  color: #ffd1a3;
  cursor: pointer;
  font-size: 0.875rem;
  transition: 0.2s;
}

.error-card button:hover {
  background: rgba(255, 183, 107, 0.25);
}
</style>
