<script setup lang="ts">
definePageMeta({
  title: 'Monitor',
})

const refreshInterval = ref(5)
const serverList = ref([
  {
    url: 'vpn.bits.co.id',
    ping: [] as Array<{ delay: number; date: Date }>,
    status: 'Checking' as 'Checking' | 'Online' | 'Offline',
    provider: 'Browser probe',
    lastCheckedAt: null as Date | null,
    errors: [] as string[],
  },
])
const intervalIds: ReturnType<typeof setInterval>[] = []

async function probeServer(server: (typeof serverList.value)[number]) {
  const startTime = Date.now()

  try {
    await fetch(`https://${server.url}/`, {
      method: 'GET',
      cache: 'no-store',
      mode: 'no-cors',
    })

    const delay = Date.now() - startTime
    server.status = 'Online'
    server.lastCheckedAt = new Date()
    server.ping.push({ delay, date: new Date() })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Request failed'
    server.status = 'Offline'
    server.lastCheckedAt = new Date()
    server.errors.unshift(message)
    server.ping.push({ delay: 0, date: new Date() })
  }

  if (server.errors.length > 4) {
    server.errors = server.errors.slice(0, 4)
  }

  if (server.ping.length > 24) {
    server.ping.shift()
  }
}

function latestPingDelay(server: any) {
  const lastPing = server.ping?.[server.ping.length - 1]
  return typeof lastPing?.delay === 'number' && lastPing.delay > 0 ? lastPing.delay : null
}

function pingStateClass(server: any) {
  if (server.status === 'Offline') return 'status-bad'
  const delay = latestPingDelay(server)
  if (delay === null) return 'status-idle'
  if (delay <= 150) return 'status-good'
  if (delay <= 350) return 'status-warn'
  return 'status-bad'
}

function pingLabel(server: any) {
  const delay = latestPingDelay(server)
  if (server.status === 'Offline') return 'Offline'
  return delay === null ? '--' : `${delay} ms`
}

function lastCheckedLabel(server: any) {
  if (!server.lastCheckedAt) return 'Waiting...'

  const secondsAgo = Math.max(0, Math.round((Date.now() - server.lastCheckedAt.getTime()) / 1000))
  return `${secondsAgo}s ago`
}

onMounted(async () => {
  for (const server of serverList.value) {
    await probeServer(server)

    intervalIds.push(
      setInterval(() => {
        if (server.errors.length) server.errors.pop()
      }, 5000)
    )

    intervalIds.push(
      setInterval(() => {
        probeServer(server)
      }, refreshInterval.value * 1000)
    )
  }
})

onBeforeUnmount(() => {
  intervalIds.forEach(id => clearInterval(id))
})
</script>

<template>
  <section class="uptime-shell" aria-label="Server monitor">
    <div class="head-row">
      <h1 class="view-title">
        <span class="view-icon"><Icon name="uil:chart-line" size="14" aria-hidden="true" /></span>
        <span>Monitor</span>
      </h1>
      <div class="head-pills" aria-label="Monitor statistics">
        <span class="refresh-pill"
          ><Icon name="uil:history" size="13" aria-hidden="true" /> {{ refreshInterval }}s</span
        >
        <span class="refresh-pill"
          ><Icon name="uil:server-network" size="13" aria-hidden="true" />
          {{ serverList.length }}</span
        >
      </div>
    </div>

    <Card
      v-for="(server, idx) in serverList"
      :key="server.url"
      role="article"
      :aria-label="`Server ${server.url}`"
    >
      <div class="monitor-row" :style="{ animationDelay: `${idx * 0.1}s` }">
        <div class="endpoint-cell">
          <div class="endpoint-provider-row">
            <div class="endpoint-pill">
              <Icon name="uil:server-network" size="14" aria-hidden="true" />
              <span class="endpoint-name">{{ server.url }}</span>
            </div>
            <div class="provider-pill">
              <Icon name="uil:desktop-cloud-alt" size="12" aria-hidden="true" />
              <span class="provider-name">{{ server.provider }}</span>
            </div>
          </div>
        </div>

        <div class="metric-cluster" role="group" aria-label="Server metrics">
          <div class="mini-pill" aria-label="Current status">
            <Icon name="uil:heartbeat" size="12" aria-hidden="true" /> {{ server.status }}
          </div>
          <div class="mini-pill" aria-label="Last checked time">
            <Icon name="uil:clock" size="12" aria-hidden="true" />
            {{ lastCheckedLabel(server) }}
          </div>
          <div
            class="mini-pill ping-pill"
            :class="pingStateClass(server)"
            aria-label="Ping latency"
          >
            <span class="dot" aria-hidden="true"></span>
            <Icon name="uil:wifi" size="12" aria-hidden="true" /> {{ pingLabel(server) }}
          </div>
        </div>

        <div v-if="server.errors.length" class="error-pill" role="alert" aria-live="polite">
          <Icon name="uil:exclamation-triangle" size="15" aria-hidden="true" />
          {{ server.errors[0] }}
        </div>
      </div>
    </Card>
  </section>
</template>

<style scoped>
.uptime-shell {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 0.62rem;
  height: 100%;
  overflow: hidden;
  padding-top: 0.7rem;
  animation: reveal 0.5s ease both;
}

.head-row {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.6rem;
  margin: 0.3rem 0 0.5rem;
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
  gap: 0.32rem;
}

.refresh-pill {
  border: 1px solid var(--line);
  border-radius: 9999px;
  padding: 0.24rem 0.5rem;
  color: var(--text-soft);
  background: rgba(14, 19, 34, 0.7);
  font-size: 0.74rem;
  display: inline-flex;
  align-items: center;
  gap: 0.24rem;
}

.monitor-row {
  padding: 0.65rem 0.72rem;
  display: grid;
  grid-template-columns: minmax(200px, 1.2fr) minmax(320px, 2fr);
  align-items: center;
  gap: 0.45rem;
  min-width: 0;
  animation: fadeUp 0.5s ease both;
}

.endpoint-cell {
  min-width: 0;
}

.endpoint-provider-row {
  display: flex;
  align-items: center;
  gap: 0.34rem;
  width: 100%;
  min-width: 0;
  flex-wrap: nowrap;
  overflow: hidden;
}

.endpoint-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.28rem;
  border-radius: 9999px;
  font-size: 0.76rem;
  border: 1px solid rgba(79, 140, 255, 0.42);
  padding: 0.25rem 0.56rem;
  background: linear-gradient(145deg, rgba(79, 140, 255, 0.24), rgba(79, 140, 255, 0.08));
  box-shadow: inset 0 0 0 1px rgba(79, 140, 255, 0.18);
  min-width: 0;
  max-width: 54%;
  flex: 0 1 auto;
}

.provider-pill {
  border: 1px solid rgba(96, 235, 190, 0.3);
  border-radius: 9999px;
  padding: 0.23rem 0.52rem;
  background: linear-gradient(145deg, rgba(24, 120, 96, 0.22), rgba(24, 120, 96, 0.08));
  color: #bcefe2;
  font-size: 0.7rem;
  display: inline-flex;
  align-items: center;
  gap: 0.22rem;
  min-width: 0;
  width: fit-content;
  max-width: 44%;
  flex: 0 1 auto;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.endpoint-name,
.provider-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.metric-cluster {
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.32rem;
  flex-wrap: wrap;
}

.mini-pill {
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 9999px;
  background: rgba(9, 12, 21, 0.7);
  color: var(--text-soft);
  padding: 0.24rem 0.52rem;
  font-size: 0.72rem;
  display: inline-flex;
  align-items: center;
  gap: 0.22rem;
}

.ping-pill {
  color: #d7e6ff;
}

.ping-pill .dot {
  width: 0.42rem;
  height: 0.42rem;
  border-radius: 9999px;
  background: currentColor;
  box-shadow: 0 0 0 0.22rem rgba(255, 255, 255, 0.05);
}

.status-good {
  border-color: rgba(74, 222, 128, 0.45);
  background: rgba(74, 222, 128, 0.12);
  color: #c9ffd8;
}

.status-warn {
  border-color: rgba(251, 191, 36, 0.45);
  background: rgba(251, 191, 36, 0.12);
  color: #ffe8af;
}

.status-bad {
  border-color: rgba(248, 113, 113, 0.5);
  background: rgba(248, 113, 113, 0.12);
  color: #ffd2d2;
}

.status-idle {
  border-color: rgba(148, 163, 184, 0.32);
  color: var(--text-soft);
}

.error-pill {
  grid-column: 1 / -1;
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  border-radius: 0.7rem;
  border: 1px solid rgba(248, 113, 113, 0.35);
  background: rgba(127, 29, 29, 0.18);
  color: #fecaca;
  padding: 0.42rem 0.56rem;
  font-size: 0.74rem;
}

@media (max-width: 900px) {
  .monitor-row {
    grid-template-columns: 1fr;
    align-items: stretch;
  }

  .metric-cluster {
    justify-content: flex-start;
  }
}
</style>
