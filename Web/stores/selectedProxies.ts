export const useSelectedProxiesStore = defineStore('selectedProxies', () => {
  const selectedProxiesCookie = useCookie('selected-proxies')
  const selectedProxies = ref<string[]>([])

  if (selectedProxiesCookie.value) {
    try {
      selectedProxies.value = atob(selectedProxiesCookie.value).split(',')
    } catch (e: Error) {
      console.error('Failed to parse selected proxies cookie:', e.message)
    }
  }

  const getSelectedProxies = computed(() => selectedProxies.value)

  function toggleSelectedProxies(id: string) {
    if (selectedProxies.value.includes(id)) {
      selectedProxies.value.splice(selectedProxies.value.indexOf(id), 1)
    } else {
      selectedProxies.value.push(id)
    }

    selectedProxiesCookie.value = btoa(selectedProxies.value.toString())
  }

  return { selectedProxies, getSelectedProxies, toggleSelectedProxies }
})
