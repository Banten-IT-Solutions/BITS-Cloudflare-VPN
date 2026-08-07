<script setup lang="ts">
const route = useRoute()

const routerPaths = [
  { name: 'Build', path: '/build', icon: 'uil:wrench' },
  { name: 'Convert', path: '/convert', icon: 'uil:sync' },
  { name: 'Monitor', path: '/monitor', icon: 'uil:chart-line' },
]

const isOpen = ref(false)
</script>

<template>
  <header class="nav-shell">
    <div class="nav-wrap">
      <NuxtLink to="/" class="brand-mark">
        <span class="brand-icon">
          <Icon name="uil:shield-check" size="17" />
        </span>
        <span class="brand-copy">
          <strong>BITS VPN</strong>
          <small>Always Connected</small>
        </span>
      </NuxtLink>

      <nav class="desktop-nav">
        <NuxtLink
          v-for="routerPath in routerPaths"
          :key="routerPath.path"
          :to="routerPath.path"
          class="nav-link"
          :class="route.path === routerPath.path ? 'nav-link-active' : ''"
        >
          <Icon :name="routerPath.icon" size="15" />
          <span>{{ routerPath.name }}</span>
        </NuxtLink>
      </nav>

      <button class="mobile-toggle" @click="isOpen = !isOpen">
        <Icon name="uil:bars" size="16" />
      </button>
    </div>

    <div v-if="isOpen" class="mobile-menu">
      <div class="mobile-grid">
        <NuxtLink
          v-for="routerPath in routerPaths"
          :key="routerPath.path"
          :to="routerPath.path"
          class="mobile-link"
          :class="route.path === routerPath.path ? 'nav-link-active' : ''"
          @click="isOpen = false"
        >
          <Icon :name="routerPath.icon" size="16" />
          <span>{{ routerPath.name }}</span>
        </NuxtLink>
      </div>
    </div>
  </header>
</template>

<style scoped>
.nav-shell {
  position: sticky;
  top: 0;
  z-index: 50;
  border-bottom: 1px solid var(--line);
  background: linear-gradient(180deg, rgba(8, 11, 20, 0.84), rgba(8, 11, 20, 0.72));
  backdrop-filter: blur(12px);
}

.nav-wrap {
  margin: 0 auto;
  width: min(1200px, 92vw);
  min-height: 64px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
}

.brand-mark {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
}

.brand-icon {
  width: 1.95rem;
  height: 1.95rem;
  border-radius: 0.65rem;
  display: grid;
  place-items: center;
  color: #d9e8ff;
  background: linear-gradient(145deg, rgba(79, 140, 255, 0.45), rgba(79, 140, 255, 0.15));
  box-shadow: 0 0 14px rgba(79, 140, 255, 0.42);
  animation: pulseGlow 2.7s ease-in-out infinite;
}

.brand-copy {
  display: flex;
  flex-direction: column;
  line-height: 1;
  margin-left: 10px;
}

.brand-copy strong {
  font-family: 'Space Grotesk', sans-serif;
  color: var(--text-main);
  font-size: 0.98rem;
  letter-spacing: 0.02em;
}

.brand-copy small {
  margin-top: 0.2rem;
  color: var(--text-soft);
  font-size: 0.66rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.desktop-nav {
  display: none;
  align-items: center;
  gap: 0.36rem;
}

.nav-link,
.mobile-link {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  border-radius: 0.7rem;
  padding: 0.4rem 0.68rem;
  color: var(--text-soft);
  transition:
    transform 0.2s ease,
    background-color 0.2s ease,
    color 0.2s ease;
}

.nav-link:hover,
.mobile-link:hover,
.nav-link-active {
  color: var(--text-main);
  background: rgba(79, 140, 255, 0.18);
}

.nav-link:hover,
.mobile-link:hover {
  transform: translateY(-1px);
}

.mobile-toggle {
  border: 1px solid var(--line);
  border-radius: 0.62rem;
  width: 2rem;
  height: 2rem;
  display: grid;
  place-items: center;
  color: var(--text-main);
  background: rgba(16, 21, 36, 0.65);
}

.mobile-menu {
  border-top: 1px solid var(--line);
  background: rgba(8, 11, 20, 0.92);
}

.mobile-grid {
  margin: 0 auto;
  width: min(1200px, 92vw);
  padding: 0.55rem 0;
  display: grid;
  gap: 0.28rem;
}

@media (min-width: 768px) {
  .desktop-nav {
    display: inline-flex;
  }

  .mobile-toggle {
    display: none;
  }
}

@keyframes pulseGlow {
  0%,
  100% {
    box-shadow: 0 0 12px rgba(79, 140, 255, 0.42);
  }
  50% {
    box-shadow: 0 0 20px rgba(79, 140, 255, 0.64);
  }
}
</style>
