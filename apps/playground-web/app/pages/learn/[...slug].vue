<script setup lang="ts">
const route = useRoute()

// Strip the /learn prefix — content files are at /tutorials/..., /reference/..., etc.
const contentPath = route.path.replace(/^\/learn/, '') || '/'

const { data: page, error } = await useAsyncData(route.path, () =>
  queryCollection('content').path(contentPath).first()
)

if (!page.value && !error.value) {
  throw createError({ statusCode: 404, statusMessage: 'Page not found' })
}

useSeoMeta({
  title: () => page.value?.title ?? 'wasm4pm Playground',
  description: () => page.value?.description ?? 'Interactive process mining playground'
})

// Build sidebar nav from content collection
const { data: rawNav } = await useAsyncData('nav', () =>
  queryCollectionNavigation('content')
)

// Map ContentNavigationItem[] to UNavigationMenu format { label, to, icon, children }
type NavItem = {
  label: string
  to?: string
  icon?: string
  children?: NavItem[]
}

function prefixLearn(path?: string) {
  if (!path) return path
  return path.startsWith('/learn') ? path : `/learn${path}`
}

function mapNavItems(items: any[]): NavItem[] {
  if (!items?.length) return []
  return items.map((item) => {
    const rawPath = item.path ?? item._path ?? item.to
    const mapped: NavItem = {
      label: item.title ?? item.label ?? '',
      to: prefixLearn(rawPath),
      icon: item.icon
    }
    if (item.children?.length) {
      mapped.children = mapNavItems(item.children)
    }
    return mapped
  })
}

const nav = computed(() => mapNavItems(rawNav.value ?? []))

// Mobile sidebar toggle
const sidebarOpen = ref(false)
function toggleSidebar() {
  sidebarOpen.value = !sidebarOpen.value
}
function closeSidebar() {
  sidebarOpen.value = false
}

// Close sidebar on route change
watch(() => route.path, closeSidebar)
</script>

<template>
  <div class="flex min-h-screen">
    <!-- Mobile overlay -->
    <Transition name="fade">
      <div
        v-if="sidebarOpen"
        class="fixed inset-0 z-20 bg-black/50 lg:hidden"
        @click="closeSidebar"
      />
    </Transition>

    <!-- Sidebar -->
    <aside
      :class="[
        'fixed lg:sticky top-0 z-30 h-screen w-64 shrink-0 border-r border-default bg-elevated flex flex-col p-4 gap-1 overflow-y-auto',
        'transition-transform duration-200 ease-in-out',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      ]"
    >
      <div class="flex items-center gap-2 px-2 py-3 mb-2">
        <UBadge color="primary" variant="soft">
          wasm4pm
        </UBadge>
        <span class="font-semibold text-sm">Playground</span>
      </div>

      <UButton
        to="/play"
        icon="i-lucide-terminal"
        variant="ghost"
        class="justify-start mb-3"
        size="sm"
        @click="closeSidebar"
      >
        Open Sandbox →
      </UButton>

      <USeparator class="mb-2" />

      <UNavigationMenu
        v-if="nav.length"
        :items="nav"
        orientation="vertical"
        class="w-full"
      />
    </aside>

    <!-- Main content area -->
    <div class="flex-1 flex flex-col min-w-0">
      <!-- Mobile header -->
      <header class="sticky top-0 z-10 flex items-center gap-3 px-4 py-3 border-b border-default bg-default/80 backdrop-blur lg:hidden">
        <UButton
          icon="i-lucide-menu"
          variant="ghost"
          size="sm"
          aria-label="Open navigation"
          @click="toggleSidebar"
        />
        <span class="font-semibold text-sm truncate">
          {{ page?.title ?? 'wasm4pm Docs' }}
        </span>
        <div class="ml-auto">
          <UButton
            to="/play"
            icon="i-lucide-terminal"
            variant="soft"
            size="xs"
          >
            Sandbox
          </UButton>
        </div>
      </header>

      <!-- 404 state -->
      <main v-if="!page" class="flex-1 flex items-center justify-center px-6 py-20">
        <div class="text-center max-w-md">
          <div class="text-6xl font-bold text-primary mb-4">
            404
          </div>
          <h1 class="text-2xl font-semibold mb-2">
            Page not found
          </h1>
          <p class="text-muted mb-6">
            The documentation page you're looking for doesn't exist or has been moved.
          </p>
          <div class="flex gap-3 justify-center">
            <UButton to="/learn/tutorials/getting-started" variant="solid">
              Getting Started
            </UButton>
            <UButton to="/play" variant="outline" icon="i-lucide-terminal">
              Open Sandbox
            </UButton>
          </div>
        </div>
      </main>

      <!-- Content -->
      <main v-else class="flex-1 max-w-4xl mx-auto w-full px-6 py-10">
        <ContentRenderer :value="page" class="prose dark:prose-invert max-w-none" />

        <!-- Bottom navigation -->
        <div class="mt-12 pt-6 border-t border-default flex justify-between items-center">
          <UButton
            to="/learn"
            icon="i-lucide-arrow-left"
            variant="ghost"
            size="sm"
          >
            Back to Docs
          </UButton>
          <UButton
            to="/play"
            icon="i-lucide-terminal"
            variant="soft"
            size="sm"
          >
            Try it in Sandbox →
          </UButton>
        </div>
      </main>
    </div>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
