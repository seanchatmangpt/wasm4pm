<script setup lang="ts">
const route = useRoute()

// Strip the /learn prefix — content files are at /tutorials/..., /reference/..., etc.
const contentPath = route.path.replace(/^\/learn/, '') || '/'

const { data: page } = await useAsyncData(route.path, () =>
  queryCollection('content').path(contentPath).first()
)

if (!page.value) {
  throw createError({ statusCode: 404, statusMessage: 'Page not found' })
}

useSeoMeta({
  title: () => page.value?.title ?? 'wasm4pm Playground',
  description: () => page.value?.description ?? 'Interactive process mining playground'
})

// Build sidebar nav from content collection
const { data: nav } = await useAsyncData('nav', () =>
  queryCollectionNavigation('content')
)
</script>

<template>
  <div class="flex min-h-screen">
    <!-- Sidebar -->
    <aside class="w-64 shrink-0 border-r border-default bg-elevated hidden lg:flex flex-col p-4 gap-1 sticky top-0 h-screen overflow-y-auto">
      <div class="flex items-center gap-2 px-2 py-3 mb-2">
        <UBadge color="primary" variant="soft">wasm4pm</UBadge>
        <span class="font-semibold text-sm">Playground</span>
      </div>
      <UButton
        to="/play"
        icon="i-lucide-terminal"
        variant="ghost"
        class="justify-start mb-3"
        size="sm"
      >
        Open Sandbox →
      </UButton>
      <UNavigationMenu v-if="nav" :items="nav" orientation="vertical" />
    </aside>

    <!-- Content -->
    <main class="flex-1 max-w-4xl mx-auto px-6 py-10">
      <ContentRenderer v-if="page" :value="page" class="prose dark:prose-invert max-w-none" />
    </main>
  </div>
</template>
