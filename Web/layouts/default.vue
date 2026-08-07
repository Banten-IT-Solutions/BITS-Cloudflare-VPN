<script setup lang="ts">
const route = useRoute()

function getNormalizedPath(path: string) {
  if (!path || path === '/') return '/'
  return path.replace(/\/+$/, '') || '/'
}

const isSinglePage = computed(() => {
  const normalized = getNormalizedPath(route.path)
  return normalized === '/' || normalized === '/convert' || normalized === '/monitor'
})
</script>

<template>
  <Navbar name="Bits VPN" />
  <div :class="['layout-shell', isSinglePage ? 'single-page-shell' : '']">
    <main
      :class="[
        'mx-auto w-[min(1200px,92vw)]',
        isSinglePage ? 'h-full py-0 overflow-hidden' : 'py-6',
      ]"
    >
      <slot />
    </main>
  </div>
</template>

<style scoped>
.layout-shell {
  min-height: calc(100vh - 64px);
}

.single-page-shell {
  height: calc(100vh - 64px);
}
</style>
