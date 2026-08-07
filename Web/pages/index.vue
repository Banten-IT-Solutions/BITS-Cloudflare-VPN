<script setup lang="ts">
definePageMeta({
  title: 'BITS VPN',
})

const ctas = [
  { to: '/build', icon: 'uil:wrench', label: 'Build', style: 'cta-build' },
  { to: '/convert', icon: 'uil:sync', label: 'Convert', style: 'cta-convert' },
  { to: '/monitor', icon: 'uil:chart-line', label: 'Monitor', style: 'cta-monitor' },
]
</script>

<template>
  <section class="hero-page">
    <div class="hero-content">
      <h1>BITS VPN</h1>
      <p class="subtitle">Build, Convert &amp; Monitor Cloudflare VPN.</p>

      <div class="cta-row">
        <NuxtLink
          v-for="cta in ctas"
          :key="cta.to"
          :to="cta.to"
          class="cta-link"
          :class="cta.style"
        >
          <Icon :name="cta.icon" size="16" />
          {{ cta.label }}
        </NuxtLink>
      </div>
    </div>
  </section>
</template>

<style scoped>
.hero-page {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
  text-align: center;
  padding: clamp(0.75rem, 2.5vh, 1.5rem) 0;
}

.hero-content {
  width: min(760px, 100%);
  margin-inline: auto;
  display: grid;
  justify-items: center;
  align-content: center;
  gap: clamp(0.5rem, 1.6vh, 0.95rem);
  animation: reveal 0.7s ease both;
}

h1 {
  margin: 0;
  font-family: 'Space Grotesk', sans-serif;
  font-size: clamp(2.1rem, 7vw, 4.5rem);
  line-height: 0.95;
}

.subtitle {
  margin: 0;
  max-width: 38ch;
  margin-inline: auto;
  color: var(--text-soft);
  font-size: clamp(0.88rem, 2.2vw, 1.02rem);
}

.cta-row {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.52rem;
  justify-content: center;
}

.cta-link {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  border-radius: 0.74rem;
  border: 1px solid transparent;
  padding: 0.5rem 0.82rem;
  font-size: 0.9rem;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.04);
  transition:
    transform 0.2s ease,
    border-color 0.2s ease,
    filter 0.2s ease;
}

.cta-build {
  border-color: rgba(79, 140, 255, 0.45);
  background: linear-gradient(135deg, rgba(79, 140, 255, 0.4), rgba(39, 88, 201, 0.22));
}

.cta-convert {
  border-color: rgba(88, 231, 176, 0.46);
  background: linear-gradient(135deg, rgba(49, 201, 147, 0.34), rgba(27, 138, 112, 0.2));
}

.cta-monitor {
  border-color: rgba(255, 188, 104, 0.5);
  background: linear-gradient(135deg, rgba(255, 168, 76, 0.36), rgba(191, 116, 36, 0.2));
}

.cta-link:hover {
  transform: translateY(-2px) scale(1.01);
  filter: brightness(1.06);
}

@media (max-width: 640px) {
  .hero-page {
    height: 100%;
    padding: 0.6rem 0;
  }

  h1 {
    font-size: clamp(1.9rem, 12vw, 3rem);
  }

  .subtitle {
    max-width: 32ch;
  }
}
</style>
