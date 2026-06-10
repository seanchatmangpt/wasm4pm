<script setup lang="ts">
const route = useRoute()
const colorMode = useColorMode()

const isPlayRoute = computed(() => route.path === '/play' || route.path.startsWith('/play/'))

const navLinks = [{
  label: 'Learn',
  to: '/learn/tutorials/getting-started',
  icon: 'i-lucide-book-open'
}, {
  label: 'Sandbox',
  to: '/play',
  icon: 'i-lucide-flask-conical'
}, {
  label: 'Petri Net',
  to: '/play/petri-net',
  icon: 'i-lucide-network'
}, {
  label: 'Reference',
  to: '/learn/reference/algorithms',
  icon: 'i-lucide-library'
}]

function toggleColorMode() {
  colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
}
</script>

<template>
  <div class="min-h-screen flex flex-col bg-background text-foreground">
    <header v-if="!isPlayRoute" class="sticky top-0 z-50 border-b border-default bg-background/80 backdrop-blur">
      <div class="max-w-7xl mx-auto px-4 h-14 flex items-center gap-6">
        <!-- Logo -->
        <NuxtLink to="/" class="flex items-center gap-2 shrink-0">
          <span class="font-mono font-bold text-lg tracking-tight text-primary">wasm4pm</span>
          <UBadge label="playground" color="primary" variant="subtle" size="xs" />
        </NuxtLink>

        <!-- Center nav -->
        <nav class="flex-1 flex justify-center">
          <UNavigationMenu
            :items="navLinks"
            orientation="horizontal"
          />
        </nav>

        <!-- Right actions -->
        <div class="flex items-center gap-2 shrink-0">
          <ClientOnly>
            <UButton
              :icon="colorMode.value === 'dark' ? 'i-lucide-sun' : 'i-lucide-moon'"
              color="neutral"
              variant="ghost"
              size="sm"
              :aria-label="colorMode.value === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'"
              @click="toggleColorMode"
            />
          </ClientOnly>
          <UButton
            icon="i-simple-icons-github"
            color="neutral"
            variant="ghost"
            size="sm"
            to="https://github.com/chatmangpt-org/wasm4pm"
            target="_blank"
            aria-label="GitHub repository"
          />
        </div>
      </div>
    </header>

    <main class="flex-1 flex flex-col">
      <slot />
    </main>
  </div>
</template>
